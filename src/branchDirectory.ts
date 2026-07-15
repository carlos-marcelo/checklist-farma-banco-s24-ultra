export type BranchDirectoryEntry = {
    branchNumber: number;
    branch: string;
    area: string;
    city: string;
};

export type CompanyAreaLike = {
    name?: unknown;
    branches?: unknown;
};

// Referencia estavel da rede. A configuracao salva na empresa continua tendo
// prioridade; esta lista impede que cache local incompleto apague area/cidade.
export const BRANCH_DIRECTORY_VERSION = 'drogaria-cidade-2026-07-15-v1';

export const BRANCH_DIRECTORY: readonly BranchDirectoryEntry[] = [
    { branchNumber: 1, branch: 'Filial 1', area: 'Área 1', city: 'SÃO GABRIEL' },
    { branchNumber: 2, branch: 'Filial 2', area: 'Área 1', city: 'SÃO GABRIEL' },
    { branchNumber: 3, branch: 'Filial 3', area: 'Área 2', city: 'LIVRAMENTO' },
    { branchNumber: 4, branch: 'Filial 4', area: 'Área 1', city: 'SÃO GABRIEL' },
    { branchNumber: 5, branch: 'Filial 5', area: 'Área 2', city: 'SANTIAGO' },
    { branchNumber: 6, branch: 'Filial 6', area: 'Área 2', city: 'ROSARIO' },
    { branchNumber: 7, branch: 'Filial 7', area: 'Área 2', city: 'LIVRAMENTO' },
    { branchNumber: 8, branch: 'Filial 8', area: 'Área 2', city: 'LIVRAMENTO' },
    { branchNumber: 9, branch: 'Filial 9', area: 'Área 1', city: 'SÃO GABRIEL' },
    { branchNumber: 10, branch: 'Filial 10', area: 'Área 1', city: 'SÃO GABRIEL' },
    { branchNumber: 12, branch: 'Filial 12', area: 'Área 1', city: 'SÃO GABRIEL' },
    { branchNumber: 13, branch: 'Filial 13', area: 'Área 2', city: 'ROSARIO' },
    { branchNumber: 14, branch: 'Filial 14', area: 'Área 2', city: 'ALEGRETE' },
    { branchNumber: 15, branch: 'Filial 15', area: 'Área 1', city: 'SÃO GABRIEL' },
    { branchNumber: 16, branch: 'Filial 16', area: 'Área 2', city: 'SANTIAGO' },
    { branchNumber: 17, branch: 'Filial 17', area: 'Área 1', city: 'CACAPAVA' },
    { branchNumber: 18, branch: 'Filial 18', area: 'Área 1', city: 'SÃO GABRIEL' }
];

const normalizeReferenceText = (value: unknown): string => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toUpperCase();

const isGenericAreaName = (value: unknown): boolean => {
    const normalized = normalizeReferenceText(value);
    return !normalized || normalized === 'GERAL' || normalized === 'SEM AREA' || normalized === 'TODAS AS AREAS';
};

export const getBranchNumber = (value: unknown): number | null => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const explicit = text.match(/\b(?:filial|loja|unidade)\s*:?\s*0*(\d{1,3})\b/i);
    if (explicit?.[1]) return Number(explicit[1]);

    const compact = text.match(/\bF\s*0*(\d{1,3})\b/i);
    if (compact?.[1]) return Number(compact[1]);

    const leading = text.match(/^0*(\d{1,3})\b/);
    if (leading?.[1]) return Number(leading[1]);

    if (/\bMATRIZ\b/i.test(text)) return 1;
    return null;
};

export const findBranchDirectoryEntry = (value: unknown): BranchDirectoryEntry | undefined => {
    const branchNumber = getBranchNumber(value);
    return branchNumber === null
        ? undefined
        : BRANCH_DIRECTORY.find(entry => entry.branchNumber === branchNumber);
};

const findConfiguredArea = (branch: unknown, areas?: readonly CompanyAreaLike[] | null): string | undefined => {
    const targetNumber = getBranchNumber(branch);
    const targetText = normalizeReferenceText(branch);
    if ((!targetText && targetNumber === null) || !Array.isArray(areas)) return undefined;

    for (const area of areas) {
        const branches = Array.isArray(area?.branches) ? area.branches : [];
        const matches = branches.some(candidate => {
            const candidateNumber = getBranchNumber(candidate);
            if (targetNumber !== null && candidateNumber !== null) return targetNumber === candidateNumber;
            const candidateText = normalizeReferenceText(candidate);
            return Boolean(candidateText) && (candidateText === targetText || candidateText.includes(targetText) || targetText.includes(candidateText));
        });
        if (matches) {
            const areaName = String(area?.name ?? '').trim();
            return areaName || undefined;
        }
    }
    return undefined;
};

export const resolveBranchArea = (
    branch: unknown,
    configuredAreas?: readonly CompanyAreaLike[] | null,
    fallback = 'Geral'
): string => {
    const configured = findConfiguredArea(branch, configuredAreas);
    const directory = findBranchDirectoryEntry(branch);
    if (configured && !isGenericAreaName(configured)) return configured;
    return directory?.area || configured || fallback;
};

const CITY_ALIASES: Array<{ match: RegExp; label: string }> = [
    { match: /\bSAO GABRIEL\b/, label: 'SÃO GABRIEL' },
    { match: /\bLIVRAMENTO\b/, label: 'LIVRAMENTO' },
    { match: /\bSANTIAGO\b/, label: 'SANTIAGO' },
    { match: /\bROSARIO\b/, label: 'ROSARIO' },
    { match: /\bALEGRETE\b/, label: 'ALEGRETE' },
    { match: /\bCACAPAVA\b/, label: 'CACAPAVA' },
    { match: /\bQUARAI\b/, label: 'QUARAÍ' },
    { match: /\bSAO BORJA\b/, label: 'SÃO BORJA' }
];

const inferCityFromText = (value: unknown): string | undefined => {
    const normalized = normalizeReferenceText(value);
    if (!normalized) return undefined;
    return CITY_ALIASES.find(city => city.match.test(normalized))?.label;
};

export const resolveBranchCity = (branch: unknown, explicitCity?: unknown): string | undefined => {
    const explicit = String(explicitCity ?? '').replace(/\s+/g, ' ').trim();
    if (explicit) return inferCityFromText(explicit) || explicit;

    const directory = findBranchDirectoryEntry(branch);
    return directory?.city || inferCityFromText(branch);
};

export const stabilizeCompanyAreas = (
    companyName: unknown,
    configuredAreas?: readonly CompanyAreaLike[] | null
): Array<{ name: string; branches: string[] }> => {
    const companyKey = normalizeReferenceText(companyName);
    if (!companyKey.includes('DROGARIA CIDADE')) {
        return (configuredAreas || []).map(area => ({
            name: String(area?.name ?? '').trim() || 'Sem Área',
            branches: Array.isArray(area?.branches)
                ? area.branches.map(branch => String(branch ?? '').trim()).filter(Boolean)
                : []
        }));
    }

    const grouped = new Map<string, Map<number | string, string>>();
    const addBranch = (areaName: string, branch: string) => {
        const normalizedArea = areaName.trim() || 'Sem Área';
        const branchNumber = getBranchNumber(branch);
        const key = branchNumber ?? normalizeReferenceText(branch);
        if (key === '') return;
        const areaBranches = grouped.get(normalizedArea) || new Map<number | string, string>();
        areaBranches.set(key, branchNumber === null ? branch : `Filial ${branchNumber}`);
        grouped.set(normalizedArea, areaBranches);
    };

    BRANCH_DIRECTORY.forEach(entry => {
        const configured = findConfiguredArea(entry.branch, configuredAreas);
        addBranch(configured && !isGenericAreaName(configured) ? configured : entry.area, entry.branch);
    });

    (configuredAreas || []).forEach(area => {
        const areaName = String(area?.name ?? '').trim() || 'Sem Área';
        const branches = Array.isArray(area?.branches) ? area.branches : [];
        branches.forEach(rawBranch => {
            const branch = String(rawBranch ?? '').trim();
            if (!branch || findBranchDirectoryEntry(branch)) return;
            addBranch(areaName, branch);
        });
    });

    return Array.from(grouped.entries())
        .map(([name, branchMap]) => ({
            name,
            branches: Array.from(branchMap.values()).sort((a, b) => {
                const aNumber = getBranchNumber(a);
                const bNumber = getBranchNumber(b);
                if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
                return a.localeCompare(b, 'pt-BR');
            })
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

export const getCompanyAreasSignature = (companies: unknown): string => {
    const rows = Array.isArray(companies) ? companies : [];
    return JSON.stringify(rows.map((company: any) => ({
        id: String(company?.id || ''),
        name: String(company?.name || ''),
        areas: stabilizeCompanyAreas(company?.name, company?.areas)
    })).sort((a, b) => a.id.localeCompare(b.id)));
};
