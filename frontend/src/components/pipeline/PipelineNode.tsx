import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeStatus } from '@/types/pipeline';
import { STATUS_CONFIG } from '@/utils/pipelineColors';

interface PipelineNodeData {
  label: string;
  status: NodeStatus;
  icon: string;
  [key: string]: unknown;
}

function NodeIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'play':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'document':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M7 2h8l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z" />
          <path d="M15 2v5h5" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      );
    case 'download':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
          <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
      );
    case 'brain':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M12 2a7 7 0 017 7c0 2.5-1.3 4.7-3.2 6l-.8.6V18a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2.4l-.8-.6A7 7 0 0112 2z" />
          <path d="M10 22h4" />
          <path d="M9 9h2m2 0h2" />
        </svg>
      );
    case 'search':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="11" cy="11" r="7" />
          <path d="M16 16l4.5 4.5" />
        </svg>
      );
    case 'shield':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M12 3l8 4v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4z" />
          <path d="M12 8v4m0 3h.01" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

export const PipelineNode = memo(function PipelineNode({ data }: { data: PipelineNodeData }) {
  const { label, status, icon } = data;
  const config = STATUS_CONFIG[status];

  return (
    <div
      className={`
        relative w-[180px] rounded-lg border-t-2 bg-[#141927]/90 backdrop-blur-sm
        px-3 py-3 flex flex-col items-center gap-1.5
        ${config.border} ${config.glow}
        ${status === 'processing' ? 'animate-pulse' : ''}
      `}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-white/20 !border-white/30" />

      <div className={`${config.text}`}>
        <NodeIcon icon={icon} />
      </div>

      <span className="text-sm font-medium text-white/90">{label}</span>

      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        <span className={`text-xs ${config.text}`}>{config.label}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-white/20 !border-white/30" />
    </div>
  );
});

export default PipelineNode;
