
export enum AuditStatus {
    TODO = 'pendente',
    IN_PROGRESS = 'iniciado',
    DONE = 'concluido'
}

export interface Product {
    code: string;
    reducedCode?: string;
    barcode?: string;
    barcodeAliases?: string[];
    name: string;
    quantity: number;
    cost?: number; // Preço de custo unitário
}

export interface PostAuditAdjustment {
    id: string;
    code: string;
    barcode?: string;
    reducedCode?: string;
    description: string;
    mode?: 'delta' | 'replace';
    previousAuditedQty?: number;
    replacementQuantity?: number;
    quantity: number;
    unitCost: number;
    totalCost: number;
    groupId?: string;
    groupName?: string;
    deptId?: string;
    deptName?: string;
    catId?: string;
    catName?: string;
    note?: string;
    createdAt: string;
    createdBy?: string;
}

export interface Category {
    id: string;
    numericId?: string;
    name: string;
    itemsCount: number;
    totalQuantity: number;
    totalCost: number; // Preço de custo total (quantidade * custo)
    status: AuditStatus;
    products: Product[];
}

export interface Department {
    id: string;
    numericId?: string;
    name: string;
    categories: Category[];
}

export interface Group {
    id: string;
    name: string;
    departments: Department[];
}

export interface AuditData {
    groups: Group[];
    empresa: string;
    filial: string;
    inventoryNumber?: string;
    termDrafts?: Record<string, any>;
    partialStarts?: Array<{
        startedAt: string;
        groupId?: string;
        deptId?: string;
        catId?: string;
    }>;
    partialCompleted?: Array<{
        startedAt?: string;
        completedAt: string;
        batchId?: string;
        groupId?: string;
        deptId?: string;
        catId?: string;
    }>;
    postAuditAdjustments?: PostAuditAdjustment[];
    lastPartialBatchId?: string;
    sharedExcelMetrics?: any;
    sharedGroupExcelMetrics?: Record<string, any>;
    pendingSync?: boolean;
    lastLocalUpdate?: string;
}

export interface ViewState {
    level: 'groups' | 'departments' | 'categories' | 'products';
    selectedGroupId?: string;
    selectedDeptId?: string;
    selectedCatId?: string;
}
