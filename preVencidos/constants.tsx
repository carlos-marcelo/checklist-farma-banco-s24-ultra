
import React from 'react';
import { LayoutDashboard, ClipboardCheck, BarChart3, ScanLine, FileUp } from 'lucide-react';

export const COLORS = {
  primary: '#3b82f6',
  secondary: '#64748b',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b'
};

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'registration', label: 'Cadastro PV', icon: <ClipboardCheck size={20} /> },
  { id: 'analysis', label: 'Análise de Vendas', icon: <BarChart3 size={20} /> },
];
