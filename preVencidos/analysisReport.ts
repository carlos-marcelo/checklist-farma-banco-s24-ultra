import { PVRecord, SalesRecord } from './types';

const MONTH_NAMES_PT_BR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const getExpiryMonthLabel = (expiryDate?: string) => {
  if (!expiryDate) return 'MÊS NÃO INFORMADO';

  const [monthPart, yearPart] = expiryDate.split('/');
  if (!monthPart || !yearPart) return 'MÊS NÃO INFORMADO';

  const monthIndex = Number(monthPart);
  if (Number.isNaN(monthIndex) || monthIndex < 1 || monthIndex > 12) return 'MÊS NÃO INFORMADO';

  const normalizedYear = yearPart.length === 2 ? `20${yearPart}` : yearPart;
  const monthLabel = MONTH_NAMES_PT_BR[monthIndex - 1];

  return `${monthLabel}/${normalizedYear}`;
};

export type AnalysisItemStatus = 'sold' | 'replaced' | 'lost';

export interface AnalysisReportDetail {
  name: string;
  seller: string;
  code: string;
  totalSoldInReport?: number;
  qty?: number;
  unitPrice?: number;
  totalValue?: number;
  costUnit?: number;
  costTotal?: number;
  lab?: string;
}

export interface AnalysisReportItem {
  reducedCode: string;
  name: string;
  dcb: string;
  quantity: number;
  expiryDate?: string;
  expiryMonthLabel: string;
  directSoldQty: number;
  similarSoldQty: number;
  directSalesValue: number;
  similarSalesValue: number;
  status: AnalysisItemStatus;
  directSalesDetails: AnalysisReportDetail[];
  similarSalesDetails: AnalysisReportDetail[];
}

export interface AnalysisReportMeta {
  company?: string;
  branch?: string;
  area?: string;
  file_name?: string | null;
  uploaded_at?: string | null;
  period_start?: string | null;
  period_end?: string | null;
}

export interface AnalysisReportSummary {
  total_items: number;
  total_direct: number;
  total_similar: number;
}

export interface AnalysisReportPayload {
  period_label: string;
  generated_at: string;
  meta?: AnalysisReportMeta;
  summary: AnalysisReportSummary;
  finalized_codes?: string[];
  items: AnalysisReportItem[];
}

export const buildAnalysisReportPayload = (params: {
  pvRecords: PVRecord[];
  salesRecords: SalesRecord[];
  periodLabel: string;
  finalizedCodes?: string[];
  meta?: AnalysisReportMeta;
}): AnalysisReportPayload => {
  const {
    pvRecords: rawPvRecords,
    salesRecords: rawSalesRecords,
    periodLabel,
    finalizedCodes = [],
    meta
  } = params;
  const pvRecords = Array.isArray(rawPvRecords) ? rawPvRecords : [];
  const salesRecords = Array.isArray(rawSalesRecords) ? rawSalesRecords : [];

  const items: AnalysisReportItem[] = pvRecords.map(pv => {
    const directSales = salesRecords.filter(s => s.reducedCode === pv.reducedCode);
    const directSoldQty = directSales.reduce((acc, s) => acc + s.quantity, 0);

    const directSalesDetails = directSales.map(sale => ({
      name: sale.productName,
      seller: sale.salesperson,
      code: sale.reducedCode,
      totalSoldInReport: sale.quantity,
      unitPrice: sale.unitPrice || 0,
      totalValue: sale.totalValue || 0,
      costUnit: sale.costUnit || 0,
      costTotal: sale.costTotal || 0,
      lab: sale.lab || 'N/A'
    }));

    const isValidDCB = (dcb?: string) => dcb && dcb.trim() !== '' && dcb.toUpperCase() !== 'N/A';
    const similarSales = isValidDCB(pv.dcb)
      ? salesRecords.filter(s => s.dcb === pv.dcb && s.reducedCode !== pv.reducedCode)
      : [];
    const similarSoldQty = similarSales.reduce((acc, s) => acc + s.quantity, 0);

    const similarSalesDetails = similarSales.map(sale => ({
      name: sale.productName,
      seller: sale.salesperson,
      code: sale.reducedCode,
      qty: sale.quantity,
      unitPrice: sale.unitPrice || 0,
      totalValue: sale.totalValue || 0,
      costUnit: sale.costUnit || 0,
      costTotal: sale.costTotal || 0,
      lab: sale.lab || 'N/A'
    }));

    let status: AnalysisItemStatus = 'lost';
    if (directSoldQty > 0) status = 'sold';
    else if (similarSoldQty > 0) status = 'replaced';

    const directSalesValue = directSales.reduce((acc, s) => acc + (s.totalValue || 0), 0);
    const similarSalesValue = similarSales.reduce((acc, s) => acc + (s.totalValue || 0), 0);

    return {
      reducedCode: pv.reducedCode,
      name: pv.name,
      dcb: pv.dcb || 'N/A',
      quantity: pv.quantity,
      expiryDate: pv.expiryDate,
      expiryMonthLabel: getExpiryMonthLabel(pv.expiryDate),
      directSoldQty,
      similarSoldQty,
      directSalesValue,
      similarSalesValue,
      status,
      directSalesDetails,
      similarSalesDetails
    };
  });

  const filteredItems = items.filter(item => item.status !== 'lost');
  const totalSimilar = filteredItems.filter(item => item.status === 'replaced').length;
  const totalDirect = filteredItems.filter(item => item.status === 'sold').length;

  return {
    period_label: periodLabel || 'Período não identificado',
    generated_at: new Date().toISOString(),
    meta,
    summary: {
      total_items: filteredItems.length,
      total_direct: totalDirect,
      total_similar: totalSimilar
    },
    finalized_codes: finalizedCodes,
    items: filteredItems
  };
};

const escapeHtml = (input: string) => (
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
);

const formatTimestamp = (value?: string | null) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const formatCurrency = (value?: number | null) => {
  const safeValue = Number(value || 0);
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(safeValue);
  } catch {
    return `R$ ${safeValue.toFixed(2)}`;
  }
};

export const buildAnalysisReportHtml = (
  payload: AnalysisReportPayload,
  options?: { autoPrint?: boolean }
) => {
  const finalizedCodes = payload.finalized_codes || [];
  const headerLines = [
    payload.period_label ? `Período: ${payload.period_label}` : '',
    payload.meta?.company ? `Empresa: ${payload.meta.company}` : '',
    payload.meta?.branch ? `Filial: ${payload.meta.branch}` : '',
    payload.meta?.area ? `Área: ${payload.meta.area}` : '',
    payload.meta?.file_name ? `Arquivo: ${payload.meta.file_name}` : '',
    payload.meta?.uploaded_at ? `Relatório extraído em: ${formatTimestamp(payload.meta.uploaded_at)}` : ''
  ].filter(Boolean);

  const itemsHtml = payload.items.map(item => {
    const isFinalized = finalizedCodes.includes(item.reducedCode);
    const statusLabel = isFinalized
      ? 'Finalizado no período'
      : item.status === 'replaced'
        ? 'Similar vendido'
        : 'Vendeu PV';

    const statusClass = isFinalized
      ? 'badge badge-finalized'
      : item.status === 'replaced'
        ? 'badge badge-similar'
        : 'badge badge-sold';

    const directDetails = item.directSalesDetails.length
      ? `<ul>${item.directSalesDetails.map(detail => (
        `<li><strong>${escapeHtml(detail.name)}</strong>${detail.lab ? ` · Lab: ${escapeHtml(detail.lab)}` : ''} · Vendedor: ${escapeHtml(detail.seller)} · Qtde: ${detail.totalSoldInReport ?? 0} · Unit: ${formatCurrency(detail.unitPrice)} · Total: ${formatCurrency(detail.totalValue)} · Custo: ${formatCurrency(detail.costTotal)}</li>`
      )).join('')}</ul>`
      : '<p class="muted">Sem vendas diretas.</p>';

    const similarDetails = item.similarSalesDetails.length
      ? `<ul>${item.similarSalesDetails.map(detail => (
        `<li><strong>${escapeHtml(detail.name)}</strong> (RED ${escapeHtml(detail.code)})${detail.lab ? ` · Lab: ${escapeHtml(detail.lab)}` : ''} · Vendedor: ${escapeHtml(detail.seller)} · Qtde: ${detail.qty ?? 0} · Unit: ${formatCurrency(detail.unitPrice)} · Total: ${formatCurrency(detail.totalValue)} · Custo: ${formatCurrency(detail.costTotal)}</li>`
      )).join('')}</ul>`
      : '<p class="muted">Sem similares vendidos.</p>';

    return `
      <div class="item">
        <div class="item-head">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="meta-line">RED: ${escapeHtml(item.reducedCode)} · DCB: ${escapeHtml(item.dcb || 'N/A')} · PV em estoque: ${item.quantity} · Vencimento: ${escapeHtml(item.expiryMonthLabel)}</div>
            <div class="meta-line">Valor PV: ${formatCurrency(item.directSalesValue)} · Valor Similar: ${formatCurrency(item.similarSalesValue)}</div>
          </div>
          <span class="${statusClass}">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="columns">
          <div>
            <h4>Venda Direta (SKU)</h4>
            ${directDetails}
          </div>
          <div>
            <h4>Similar Vendido</h4>
            ${similarDetails}
          </div>
        </div>
      </div>
    `;
  }).join('');

  const autoPrintScript = options?.autoPrint
    ? '<script>window.onload = () => window.print();</script>'
    : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Análise de Vendas - Pré-Vencidos</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; }
          h1 { font-size: 20px; margin: 0 0 8px; }
          h2 { font-size: 14px; margin: 0 0 16px; color: #334155; }
          h3 { font-size: 16px; margin: 0 0 4px; }
          h4 { font-size: 12px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
          .meta { font-size: 11px; color: #475569; margin-bottom: 16px; }
          .meta-line { font-size: 11px; color: #64748b; margin-top: 4px; }
          .summary { display: flex; gap: 12px; margin: 16px 0 24px; flex-wrap: wrap; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; min-width: 160px; }
          .card strong { display: block; font-size: 18px; margin-top: 4px; }
          .item { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }
          .item-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
          .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 12px; }
          ul { padding-left: 16px; margin: 6px 0 0; }
          li { font-size: 12px; color: #0f172a; margin-bottom: 4px; }
          .muted { font-size: 12px; color: #94a3b8; }
          .badge { display: inline-block; padding: 4px 8px; border-radius: 999px; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; }
          .badge-sold { background: #2563eb; color: #fff; }
          .badge-similar { background: #f59e0b; color: #fff; }
          .badge-finalized { background: #16a34a; color: #fff; }
          .footer { margin-top: 20px; font-size: 10px; color: #94a3b8; }
          .no-print { margin-bottom: 16px; }
          .no-print button { background: #2563eb; color: #fff; border: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="no-print">
          <button onclick="window.print()">Imprimir</button>
        </div>
        <h1>Análise de Vendas - Pré-Vencidos</h1>
        <h2>Detalhamento por SKU e Similar Vendido</h2>
        ${headerLines.length ? `<div class="meta">${headerLines.map(line => `<div>${escapeHtml(line)}</div>`).join('')}</div>` : ''}
        <div class="summary">
          <div class="card">Itens com venda direta<strong>${payload.summary.total_direct}</strong></div>
          <div class="card">Itens com similar vendido<strong>${payload.summary.total_similar}</strong></div>
          <div class="card">Total de itens analisados<strong>${payload.summary.total_items}</strong></div>
        </div>
        ${itemsHtml || '<p class="muted">Nenhum item encontrado para este período.</p>'}
        <div class="footer">Gerado em ${formatTimestamp(payload.generated_at)}</div>
        ${autoPrintScript}
      </body>
    </html>
  `;
};
