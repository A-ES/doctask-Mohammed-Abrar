import { memo } from 'react';
import { getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { NodeStatus } from '@/types/pipeline';

interface SmoothEdgeData {
  sourceStatus?: NodeStatus;
  [key: string]: unknown;
}

export const SmoothEdge = memo(function SmoothEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const edgeData = data as SmoothEdgeData | undefined;
  const sourceStatus = edgeData?.sourceStatus ?? 'ready';

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 20,
  });

  let strokeColor = 'rgba(255,255,255,0.15)';
  let glowFilter = '';
  let animationClass = '';

  if (sourceStatus === 'complete') {
    strokeColor = 'rgba(16,185,129,0.5)';
    glowFilter = 'drop-shadow(0 0 3px rgba(16,185,129,0.3))';
  } else if (sourceStatus === 'processing') {
    strokeColor = 'rgba(99,102,241,0.6)';
    glowFilter = 'drop-shadow(0 0 4px rgba(99,102,241,0.4))';
    animationClass = 'animate-pulse';
  }

  return (
    <path
      id={id}
      d={edgePath}
      fill="none"
      stroke={strokeColor}
      strokeWidth={2}
      className={animationClass}
      style={{ filter: glowFilter }}
    />
  );
});

export default SmoothEdge;
