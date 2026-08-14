import type { NodeStatus } from '@/types/pipeline';

export const STATUS_CONFIG: Record<NodeStatus, { border: string; glow: string; text: string; label: string; dot: string }> = {
  ready: {
    border: 'border-white/20',
    glow: '',
    text: 'text-white/40',
    label: 'Ready to process',
    dot: 'bg-white/30',
  },
  processing: {
    border: 'border-indigo-500',
    glow: 'shadow-lg shadow-indigo-500/20',
    text: 'text-indigo-300',
    label: 'Processing...',
    dot: 'bg-indigo-400 animate-pulse',
  },
  complete: {
    border: 'border-emerald-500',
    glow: 'shadow-md shadow-emerald-500/15',
    text: 'text-emerald-300',
    label: 'Complete',
    dot: 'bg-emerald-400',
  },
  escalated: {
    border: 'border-amber-500',
    glow: 'shadow-md shadow-amber-500/15',
    text: 'text-amber-300',
    label: 'Escalated',
    dot: 'bg-amber-400',
  },
  failed: {
    border: 'border-rose-500',
    glow: 'shadow-md shadow-rose-500/15',
    text: 'text-rose-300',
    label: 'Failed',
    dot: 'bg-rose-400',
  },
};
