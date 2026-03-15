import * as XLSX from 'xlsx';
import { Product, PVRecord, SalesRecord, DCBReportRecord, InventoryCostRecord } from './types';

/**
 * Normaliza códigos reduzidos para evitar erros de tipo (string vs number) e espaços
 */
const normalizeCode = (code: any): string => {
  if (code === null || code === undefined) return "";
  const cleaned = String(code).trim();
  // Se for apenas zeros, mantém um zero, senão remove zeros à esquerda
  return cleaned === "0" ? "0" : cleaned.replace(/^0+/, '');
};

export const parseProductsXML = (xmlText: string): Product[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  const products: Product[] = [];

  const items = xmlDoc.getElementsByTagName("produto");
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    products.push({
      id: item.getElementsByTagName("id")[0]?.textContent || Math.random().toString(),
      name: item.getElementsByTagName("nome")[0]?.textContent || "Produto sem nome",
      barcode: item.getElementsByTagName("cod_barras")[0]?.textContent || "",
      reducedCode: normalizeCode(item.getElementsByTagName("cod_reduzido")[0]?.textContent),
      dcb: item.getElementsByTagName("dcb")[0]?.textContent || "N/A"
    });
  }
  return products;
};

export const parseSystemProductsXLSX = async (file: File): Promise<Product[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellText: true, cellNF: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
        const products: Product[] = [];

        const normalizeHeader = (value: any) => (
          String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
        );
        const parseBarcode = (value: any): string => {
          if (value === null || value === undefined) return '';
          if (typeof value === 'number') return String(Math.trunc(value));
          const raw = String(value).trim();
          if (!raw) return '';
          if (/e\+?/i.test(raw)) {
            const num = Number(raw.replace(',', '.'));
            if (Number.isFinite(num)) return String(Math.trunc(num));
          }
          return raw.replace(/\D/g, '');
        };

        let reducedIdx = 2; // C
        let nameIdx = 3; // D
        let labIdx = 5; // F
        let barcodeIdx = 10; // K
        let dcbIdx = -1;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row) || row.length < 3) continue;

          const lowerRow = row.map(val => normalizeHeader(val));
          const findIndexSafe = (predicate: (value: string) => boolean) => {
            for (let idx = 0; idx < lowerRow.length; idx++) {
              const value = lowerRow[idx] || "";
              if (predicate(value)) return idx;
            }
            return -1;
          };

          const idxReduced = findIndexSafe(val => val.includes('reduzido') || val.includes('cod reduzido') || val.includes('código reduzido'));
          const idxName = findIndexSafe(val => val.includes('descri') || val.includes('produto'));
          const idxLab = findIndexSafe(val => val.includes('laboratório') || val.includes('laboratorio') || val === 'lab');
          const idxBarcode = findIndexSafe(val =>
            val.includes('barras') ||
            val.includes('cod barras') ||
            val.includes('codigo de barras') ||
            val.includes('código de barras') ||
            val.includes('ean') ||
            val.includes('gtin') ||
            val.includes('barcode')
          );
          const idxDcb = findIndexSafe(val => val === 'dcb' || val.startsWith('dcb ') || val.includes(' dcb'));

          const isHeaderRow =
            (idxReduced >= 0 && idxName >= 0) ||
            (idxReduced >= 0 && (idxBarcode >= 0 || idxLab >= 0 || idxDcb >= 0));
          if (isHeaderRow) {
            if (idxReduced >= 0) reducedIdx = idxReduced;
            if (idxName >= 0) nameIdx = idxName;
            if (idxLab >= 0) labIdx = idxLab;
            if (idxBarcode >= 0) barcodeIdx = idxBarcode;
            if (idxDcb >= 0) dcbIdx = idxDcb;
            continue;
          }

          // Col C (2) = Reduzido, Col D (3) = Descrição, Col F (5) = Laboratório, Col K (10) = Barras
          const reducedCode = normalizeCode(row[reducedIdx]);
          const name = String(row[nameIdx] || "").trim();
          const lab = String(row[labIdx] || "").trim();
          const dcb = dcbIdx >= 0 ? String(row[dcbIdx] || "").trim() : "";
          let barcode = parseBarcode(row[barcodeIdx]);
          if (!barcode || barcode.length < 8) {
            const candidate = row
              .map(val => parseBarcode(val))
              .filter(val => val && val.length >= 8)
              .sort((a, b) => b.length - a.length)[0];
            if (candidate) barcode = candidate;
          }

          if (reducedCode !== "" && !isNaN(Number(reducedCode))) {
            products.push({
              id: `sys-${reducedCode}-${i}`,
              name: name || "Produto sem descrição",
              barcode: barcode,
              reducedCode: reducedCode,
              dcb: dcb || "N/A",
              lab: lab || undefined
            });
          }
        }
        resolve(products);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

export const parseDCBProductsXLSX = async (file: File): Promise<Product[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellText: true, cellNF: true });
        const normalizeHeader = (value: any) => (
          String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
        );
        const parseRows = (rows: any[][], sheetName: string): Product[] => {
          const groupedProducts: Product[] = [];
          let currentDCB = "N/A";

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            let isHeaderRow = false;
            for (let c = 0; c < Math.min(row.length, 6); c++) {
              const val = String(row[c] || "").trim().toUpperCase();
              if (val.includes("DCB") && !/^\d+$/.test(val.replace("DCB", "").trim())) {
                const dcbCode = String(row[c + 1] || "").trim();
                const dcbDesc = String(row[c + 2] || "").trim();
                if (dcbCode) {
                  currentDCB = dcbCode + (dcbDesc ? ` - ${dcbDesc}` : "");
                } else {
                  currentDCB = val.replace("DCB:", "").replace("DCB", "").trim() || currentDCB;
                }
                isHeaderRow = true;
                break;
              }
            }
            if (isHeaderRow) continue;

            let reducedCode = "";
            let productName = "";
            for (let c = 0; c < Math.min(row.length, 6); c++) {
              const val = String(row[c] || "").trim();
              if (/^\d+$/.test(val) && val !== "") {
                reducedCode = normalizeCode(val);
                productName = String(row[c + 1] || row[c + 2] || "").trim();
                break;
              }
            }

            if (reducedCode && productName.length > 2) {
              groupedProducts.push({
                id: `dcb-${sheetName}-${reducedCode}-${i}`,
                name: productName,
                barcode: "",
                reducedCode,
                dcb: currentDCB
              });
            }
          }

          const tabularProducts: Product[] = [];
          let reducedIdx = 2; // C
          let nameIdx = 3; // D
          let dcbIdx = 1; // B (fallback comum)
          let foundHeader = false;

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!Array.isArray(row) || row.length < 2) continue;

            const lowerRow = row.map(val => normalizeHeader(val));
            const findIndexSafe = (predicate: (value: string) => boolean) => {
              for (let idx = 0; idx < lowerRow.length; idx++) {
                const value = lowerRow[idx] || "";
                if (predicate(value)) return idx;
              }
              return -1;
            };

            const idxReduced = findIndexSafe(val =>
              val.includes('reduzido') ||
              val.includes('cod reduzido') ||
              val.includes('código reduzido') ||
              val === 'cód.' ||
              val === 'cod.' ||
              val === 'cód' ||
              val === 'cod'
            );
            const idxName = findIndexSafe(val => val.includes('descri') || val.includes('produto') || val.includes('item'));
            const idxDcb = findIndexSafe(val => val === 'dcb' || val.startsWith('dcb ') || val.includes(' dcb'));

            if (!foundHeader && idxReduced >= 0 && (idxName >= 0 || idxDcb >= 0)) {
              reducedIdx = idxReduced;
              if (idxName >= 0) nameIdx = idxName;
              if (idxDcb >= 0) dcbIdx = idxDcb;
              foundHeader = true;
              continue;
            }

            const reducedCode = normalizeCode(row[reducedIdx]);
            const isNumericCode = /^\d+$/.test(reducedCode) && reducedCode !== "";
            if (!isNumericCode) continue;

            const productName = String(row[nameIdx] || "").trim();
            const inlineDcb = String(row[dcbIdx] || "").trim();
            const dcb = inlineDcb && inlineDcb.toUpperCase() !== 'N/A' ? inlineDcb : '';

            tabularProducts.push({
              id: `dcb-tab-${sheetName}-${reducedCode}-${i}`,
              name: productName || 'Produto sem descrição',
              barcode: '',
              reducedCode,
              dcb: dcb || 'N/A'
            });
          }

          return tabularProducts.length > groupedProducts.length ? tabularProducts : groupedProducts;
        };

        const mergedByReduced = new Map<string, Product>();
        (workbook.SheetNames || []).forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
          const parsed = parseRows(rows, sheetName);
          parsed.forEach((item) => {
            const key = normalizeCode(item.reducedCode);
            if (!key) return;
            const existing = mergedByReduced.get(key);
            const itemHasDcb = String(item.dcb || '').trim().toUpperCase() !== 'N/A';
            const existingHasDcb = existing ? String(existing.dcb || '').trim().toUpperCase() !== 'N/A' : false;
            if (!existing || (!existingHasDcb && itemHasDcb)) {
              mergedByReduced.set(key, { ...item, reducedCode: key });
            }
          });
        });

        resolve(Array.from(mergedByReduced.values()));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

export const parseSalesXLSX = async (file: File): Promise<{ sales: SalesRecord[], period: string, reportExtractedAt?: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellText: true, cellNF: true });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('Nenhuma planilha encontrada no arquivo.');
        }
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });
        const sales: SalesRecord[] = [];

        const normalizeHeader = (value: any) => (
          String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
        );
        const parseLocaleNumber = (value: any): number => {
          if (value === null || value === undefined) return 0;
          if (typeof value === 'number') return value;
          const raw = String(value).trim();
          if (!raw) return 0;
          const cleaned = raw.replace(/[^\d,.-]/g, '');
          if (!cleaned) return 0;
          const hasComma = cleaned.includes(',');
          const hasDot = cleaned.includes('.');
          if (hasComma && hasDot) {
            return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
          }
          if (hasComma) {
            return parseFloat(cleaned.replace(',', '.')) || 0;
          }
          return parseFloat(cleaned) || 0;
        };

        const parseExcelDate = (value: any): Date | null => {
          if (value === null || value === undefined || value === '') return null;

          if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return new Date(value.getTime());
          }

          if (typeof value === 'number' && Number.isFinite(value)) {
            const excelEpoch = Date.UTC(1899, 11, 30);
            const ms = Math.round(value * 24 * 60 * 60 * 1000);
            const asDate = new Date(excelEpoch + ms);
            if (!Number.isNaN(asDate.getTime())) return asDate;
          }

          const raw = String(value).trim();
          if (!raw) return null;

          const dmy = raw.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
          if (dmy) {
            const day = Number(dmy[1]);
            const month = Number(dmy[2]);
            const yearRaw = Number(dmy[3]);
            const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
            const parsed = new Date(year, month - 1, day);
            if (!Number.isNaN(parsed.getTime())) return parsed;
          }

          const iso = new Date(raw);
          if (!Number.isNaN(iso.getTime())) return iso;
          return null;
        };

        const parseExcelTime = (value: any): { hours: number; minutes: number; seconds: number } | null => {
          if (value === null || value === undefined || value === '') return null;

          if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return {
              hours: value.getHours(),
              minutes: value.getMinutes(),
              seconds: value.getSeconds()
            };
          }

          if (typeof value === 'number' && Number.isFinite(value)) {
            const fraction = value >= 1 ? value % 1 : value;
            const totalSeconds = Math.round(fraction * 24 * 60 * 60);
            const hours = Math.floor(totalSeconds / 3600) % 24;
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            return { hours, minutes, seconds };
          }

          const raw = String(value).trim();
          if (!raw) return null;
          const hms = raw.match(/(\d{1,2})[:h](\d{2})(?::(\d{2}))?/i);
          if (!hms) return null;

          const hours = Math.min(23, Math.max(0, Number(hms[1] || 0)));
          const minutes = Math.min(59, Math.max(0, Number(hms[2] || 0)));
          const seconds = Math.min(59, Math.max(0, Number(hms[3] || 0)));
          return { hours, minutes, seconds };
        };

        // Metadados do relatório (J1 = data, J2 = hora de emissão no sistema Trier)
        const readCellValue = (address: string, fallbackRow: number, fallbackCol: number) => {
          const cell = worksheet[address];
          if (cell) {
            if (cell.v !== null && cell.v !== undefined && cell.v !== '') return cell.v;
            if (cell.w !== null && cell.w !== undefined && cell.w !== '') return cell.w;
          }
          return rows[fallbackRow]?.[fallbackCol];
        };

        const j1Value = readCellValue('J1', 0, 9);
        const j2Value = readCellValue('J2', 1, 9);
        const extractedDate = parseExcelDate(j1Value);
        const extractedTime = parseExcelTime(j2Value);
        let reportExtractedAt: string | undefined;
        if (extractedDate) {
          const merged = new Date(
            extractedDate.getFullYear(),
            extractedDate.getMonth(),
            extractedDate.getDate(),
            extractedTime?.hours ?? 0,
            extractedTime?.minutes ?? 0,
            extractedTime?.seconds ?? 0
          );
          if (!Number.isNaN(merged.getTime())) {
            reportExtractedAt = merged.toISOString();
          }
        }

        // Período (default: linha 5, coluna I)
        let period = "Não identificado";
        if (rows[4] && rows[4][8]) {
          period = String(rows[4][8]).trim();
        } else {
          for (let i = 0; i < Math.min(rows.length, 12); i++) {
            const row = rows[i];
            if (!Array.isArray(row)) continue;
            const matchCell = row.find(cell => {
              const val = String(cell || '').trim();
              return /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(val);
            });
            if (matchCell) {
              period = String(matchCell).trim();
              break;
            }
          }
        }

        let currentSalesperson = "Vendedor não identificado";

        // Default indices (B, C, E, F, H, I)
        let codeIdx = 1;
        let nameIdx = 2;
        let labIdx = 4;
        let qtyIdx = 5;
        let costIdx = 7;
        let totalIdx = 8;
        let headerFound = false;
        let desctoIdx = -1;

        const parseWithIndices = (indices: { codeIdx: number; nameIdx: number; labIdx: number; qtyIdx: number; costIdx: number; totalIdx: number }) => {
          const { codeIdx, nameIdx, labIdx, qtyIdx, costIdx, totalIdx } = indices;
          const parsed: SalesRecord[] = [];
          let salesperson = currentSalesperson;

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!Array.isArray(row) || row.length < 2) continue;

            const lowerRow = row.map(val => normalizeHeader(val));

            const vendorIndex = lowerRow.findIndex(val => val.includes('vendedor'));
            if (vendorIndex >= 0) {
              const nameCandidates = row.slice(vendorIndex + 1)
                .map(val => String(val || "").trim())
                .filter(val => val !== "" && val !== "-" && !val.endsWith("-") && !/^\d+$/.test(val));
              if (nameCandidates.length > 0) {
                salesperson = nameCandidates.join(" ").replace(/\s+/g, ' ').trim();
              }
              continue;
            }

            const reducedRaw = String(row[codeIdx] || "").trim();
            const reducedCode = normalizeCode(reducedRaw);
            const isNumericCode = /^\d+$/.test(reducedCode) && reducedCode !== "";
            if (!isNumericCode) continue;

            const productName = String(row[nameIdx] || "").trim();
            const quantity = parseLocaleNumber(row[qtyIdx]);
            if (quantity <= 0) continue;

            const totalValue = parseLocaleNumber(row[totalIdx]);
            const unitPrice = quantity > 0 ? totalValue / quantity : 0;
            const costUnit = parseLocaleNumber(row[costIdx]);
            const costTotal = costUnit * quantity;
            const lab = labIdx >= 0 ? String(row[labIdx] || "").trim() : "";

            parsed.push({
              reducedCode,
              productName: productName || "Produto sem descrição",
              quantity,
              salesperson,
              date: period,
              dcb: "N/A",
              unitPrice,
              totalValue,
              lab,
              costUnit,
              costTotal
            });
          }

          return parsed;
        };

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row) || row.length < 2) continue;

          const lowerRow = row.map(val => normalizeHeader(val));
          const findIndexSafe = (predicate: (value: string) => boolean) => {
            for (let idx = 0; idx < lowerRow.length; idx++) {
              const value = lowerRow[idx] || "";
              if (predicate(value)) return idx;
            }
            return -1;
          };

          if (!headerFound) {
            const idxCode = findIndexSafe(val => val === 'código' || val === 'codigo');
            const idxName = findIndexSafe(val => val.includes('descri') || val.includes('produto'));
            const idxLab = findIndexSafe(val => val.includes('laboratório') || val.includes('laboratorio'));
            const idxQty = findIndexSafe(val => val.includes('quant') || val.includes('qtd'));
            const idxDescto = findIndexSafe(val => val.includes('descto') || val.includes('desconto'));
            const idxCost = findIndexSafe(val => val.includes('valor custo') || val.includes('vlr custo') || val === 'custo');
            const idxTotal = findIndexSafe(val => val.includes('valor vendas') || val.includes('valor venda') || val.includes('vlr vendas') || val.includes('vlr venda'));

            if (idxCode >= 0 && (idxName >= 0 || idxQty >= 0 || idxTotal >= 0)) {
              headerFound = true;
              if (idxCode >= 0) codeIdx = idxCode;
              if (idxName >= 0) nameIdx = idxName;
              if (idxLab >= 0) labIdx = idxLab;
              if (idxQty >= 0) qtyIdx = idxQty;
              if (idxDescto >= 0) desctoIdx = idxDescto;
              if (idxCost >= 0) costIdx = idxCost;
              if (idxTotal >= 0) totalIdx = idxTotal;

              if (idxQty < 0) {
                if (desctoIdx >= 0) {
                  qtyIdx = Math.max(0, desctoIdx - 1);
                } else if (labIdx >= 0) {
                  qtyIdx = labIdx + 1;
                }
              }
              continue;
            }
          }

          const vendorIndex = lowerRow.findIndex(val => val.includes('vendedor'));
          if (vendorIndex >= 0) {
            const nameCandidates = row.slice(vendorIndex + 1)
              .map(val => String(val || "").trim())
              .filter(val => val !== "" && val !== "-" && !val.endsWith("-") && !/^\d+$/.test(val));
            if (nameCandidates.length > 0) {
              currentSalesperson = nameCandidates.join(" ").replace(/\s+/g, ' ').trim();
            }
            continue;
          }

          const reducedRaw = String(row[codeIdx] || "").trim();
          const reducedCode = normalizeCode(reducedRaw);
          const isNumericCode = /^\d+$/.test(reducedCode) && reducedCode !== "";
          if (!isNumericCode) continue;

          const productName = String(row[nameIdx] || "").trim();
          const quantity = parseLocaleNumber(row[qtyIdx]);
          if (quantity <= 0) continue;

          const totalValue = parseLocaleNumber(row[totalIdx]);
          const unitPrice = quantity > 0 ? totalValue / quantity : 0;
          const costUnit = parseLocaleNumber(row[costIdx]);
          const costTotal = costUnit * quantity;
          const lab = labIdx >= 0 ? String(row[labIdx] || "").trim() : "";

          sales.push({
            reducedCode,
            productName: productName || "Produto sem descrição",
            quantity,
            salesperson: currentSalesperson,
            date: period,
            dcb: "N/A",
            unitPrice,
            totalValue,
            lab,
            costUnit,
            costTotal
          });
        }

        if (sales.length === 0) {
          const candidates = [
            { codeIdx: 1, nameIdx: 2, labIdx: 4, qtyIdx: 5, costIdx: 7, totalIdx: 8 },
            { codeIdx: 1, nameIdx: 2, labIdx: 3, qtyIdx: 4, costIdx: 6, totalIdx: 7 },
            { codeIdx: 0, nameIdx: 1, labIdx: 3, qtyIdx: 4, costIdx: 6, totalIdx: 7 },
            { codeIdx: 0, nameIdx: 2, labIdx: 4, qtyIdx: 5, costIdx: 7, totalIdx: 8 },
            { codeIdx: 1, nameIdx: 3, labIdx: 5, qtyIdx: 6, costIdx: 8, totalIdx: 9 }
          ];
          let best: SalesRecord[] = [];
          candidates.forEach(candidate => {
            const parsed = parseWithIndices(candidate);
            if (parsed.length > best.length) best = parsed;
          });
          if (best.length > 0) {
            sales.push(...best);
          }
        }
        if (sales.length === 0) {
          console.warn('⚠️ Nenhuma venda localizada no arquivo. Amostra das primeiras linhas:', rows.slice(0, 12));
          throw new Error('Nenhuma venda encontrada. Verifique se a planilha contém Código, Quantidade e Valor de Vendas.');
        }
        resolve({ sales, period, reportExtractedAt });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

export const parseDCBReportXLSX = async (file: File): Promise<DCBReportRecord[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const dcbRecords: DCBReportRecord[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 3) continue;

          const reducedCode = normalizeCode(row[0]);
          const productName = String(row[1] || "").trim();
          const dcb = String(row[2] || "N/A").trim();
          const soldQuantity = parseFloat(row[3]) || 0;

          if (dcb && dcb.toUpperCase() !== "DCB") {
            dcbRecords.push({ reducedCode, productName, dcb, soldQuantity });
          }
        }
        resolve(dcbRecords);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

export const parseSalesCSV = (csvText: string): SalesRecord[] => {
  const lines = csvText.split('\n');
  const sales: SalesRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 3) {
      const reducedCode = normalizeCode(parts[0]);
      const productName = parts[1]?.trim();
      const quantity = parseFloat(parts[2]) || 0;

      if (reducedCode && quantity > 0) {
        sales.push({
          reducedCode,
          productName: productName || "Produto CSV",
          quantity,
          salesperson: parts[3]?.trim() || "S/V",
          date: parts[4]?.trim() || "",
          dcb: parts[5]?.trim() || "N/A"
        });
      }
    }
  }
  return sales;
};

export const parseInventoryXLSX = async (file: File): Promise<InventoryCostRecord[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellText: true, cellNF: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });

        const records: InventoryCostRecord[] = [];
        const normalizeHeader = (value: any) => (
          String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
        );
        const parseBarcode = (value: any): string => {
          if (value === null || value === undefined) return '';
          if (typeof value === 'number') {
            return String(Math.trunc(value));
          }
          const raw = String(value).trim();
          if (!raw) return '';
          if (/e\+?/i.test(raw)) {
            const num = Number(raw.replace(',', '.'));
            if (Number.isFinite(num)) {
              return String(Math.trunc(num));
            }
          }
          return raw.replace(/\D/g, '');
        };
        const parseLocaleNumber = (value: any): number => {
          if (value === null || value === undefined) return 0;
          if (typeof value === 'number') return value;
          const raw = String(value).trim();
          if (!raw) return 0;
          const cleaned = raw.replace(/[^\d,.-]/g, '');
          if (!cleaned) return 0;
          const hasComma = cleaned.includes(',');
          const hasDot = cleaned.includes('.');
          if (hasComma && hasDot) {
            return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
          }
          if (hasComma) {
            return parseFloat(cleaned.replace(',', '.')) || 0;
          }
          return parseFloat(cleaned) || 0;
        };

        // Padrão do relatório atual de estoque:
        // B = código reduzido, O = estoque, P = preço de custo.
        // Se houver cabeçalhos explícitos, os índices são sobrescritos dinamicamente.
        let reducedColIndex = 1; // Coluna B (código reduzido)
        let barcodeColIndex = 1; // fallback: sem barras, usa reduzido
        let costColIndex = 15; // Coluna P (preço de custo)
        let stockColIndex = 14; // Coluna O (estoque)
        let nameColIndex = -1;
        let headersFound = false;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row) || row.length < 2) continue;

          const lowerRow = row.map(val => normalizeHeader(val));

          // Tenta detectar a linha de cabeçalho verificando múltiplas colunas conhecidas
          const foundReduced = lowerRow.findIndex(val =>
            val.includes("reduzido") ||
            val.includes("cod.red") ||
            val.includes("codigo red") ||
            val === "cód." ||
            val === "cód" ||
            val === "cod." ||
            val === "cod" ||
            val.startsWith("cód.") ||
            val.startsWith("cod.")
          );
          const foundBarcode = lowerRow.findIndex(val => val.includes("barras") || val.includes("ean") || val.includes("cod.barras") || val.includes("gtiin"));
          const foundCost = lowerRow.findIndex(val => val.includes("custo") || val.includes("vlr.custo") || val.includes("preço custo") || val.includes("preco custo"));
          const foundStock = lowerRow.findIndex(val => val.includes("estoque") || val.includes("saldo") || val.includes("qtde") || val.includes("quantidade"));
          const foundName = lowerRow.findIndex(val => val.includes("descrição") || val.includes("descricao") || val.includes("produto") || val.includes("item"));

          // Só aceita cabeçalho quando a coluna de código reduzido foi realmente identificada.
          // Isso evita confundir linhas de metadados (ex: "Saldo em Estoque com Custo").
          if (!headersFound && foundReduced >= 0) {
            if (foundReduced >= 0) reducedColIndex = foundReduced;
            if (foundBarcode >= 0) barcodeColIndex = foundBarcode;
            if (foundCost >= 0) costColIndex = foundCost;
            if (foundStock >= 0) stockColIndex = foundStock;
            if (foundName >= 0) nameColIndex = foundName;

            headersFound = true;
            console.log(`🔍 [Inventory Parsing] Cabeçalhos detectados na linha ${i}:`, { reducedColIndex, barcodeColIndex, costColIndex, stockColIndex, nameColIndex });
            continue; // Pula a linha do cabeçalho
          }

          // Para estoque, reduzido precisa ser numérico para evitar incluir metadados.
          const reducedRaw = row[reducedColIndex];
          const reducedDigits = String(reducedRaw ?? '').replace(/\D/g, '');
          const reducedCode = reducedDigits ? (reducedDigits.replace(/^0+/, '') || reducedDigits) : '';
          if (!reducedCode) continue;

          let barcode = parseBarcode(row[barcodeColIndex]);
          if (!barcode || barcode.length < 8) {
            // Tenta buscar o código de barras em outras colunas próximas se falhou no índice principal
            const candidates = [0, 1, 2]
              .filter(idx => idx >= 0 && idx < row.length)
              .map(idx => parseBarcode(row[idx]))
              .filter(val => val && val.length >= 8);
            if (candidates.length > 0) {
              barcode = candidates[0];
            }
          }

          if (!barcode && !reducedCode) continue;

          const cost = parseLocaleNumber(row[costColIndex]);
          const stock = stockColIndex >= 0 ? parseLocaleNumber(row[stockColIndex]) : undefined;
          const productName = nameColIndex >= 0 ? String(row[nameColIndex] || "").trim() : undefined;

          records.push({
            barcode,
            cost,
            stock,
            productName,
            reducedCode
          });
        }

        resolve(records);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
