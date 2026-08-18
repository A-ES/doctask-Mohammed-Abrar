/**
 * Slide-in detail panel for pipeline nodes.
 * Shows findings/conflicts/proposed-updates for Examine-stage nodes with
 * approve/reject actions. Decisions are per-item and don't affect others.
 */
import { useState, useCallback, useEffect } from 'react';
import type { QueueItem, SourceCitation } from '@/types/review';

// ─── Mock items per node (dev mode) ─────────────────────────────────────────

const MOCK_NODE_ITEMS: Record<string, QueueItem[]> = {
  extract_claims: [
    {
      id: 'item-ec-1',
      run_id: 'run-001',
      item_type: 'finding',
      payload: {
        summary: 'Capital adequacy ratio below regulatory minimum (8.5% vs 10% required)',
        details: { severity: 'high', rule_id: 'CAP-4.2', evaluation_method: 'llm' },
        source_citations: [{
          claim_id: 'c1',
          claim_text: 'The institution maintains a capital ratio of 8.5%',
          citation_status: 'grounded',
          source_location: { page_number: 12, section_id: 'sec-4.2', start_offset: 145, end_offset: 210, clause_ref: '§4.2.1' },
        }],
      },
      status: 'pending',
      queued_at: '2024-06-01T10:15:00Z',
      decided_at: null, decision: null, reviewer_id: null, justification: null,
    },
    {
      id: 'item-ec-2',
      run_id: 'run-001',
      item_type: 'conflict',
      payload: {
        summary: 'Conflicting LTV ratios stated in sections 3.1 and 5.4',
        details: { severity: 'medium', sections: ['3.1', '5.4'], evaluation_method: 'structured' },
        source_citations: [
          { claim_id: 'c2', claim_text: 'Maximum LTV ratio is 80%', citation_status: 'grounded', source_location: { page_number: 8, section_id: 'sec-3.1', start_offset: 50, end_offset: 95, clause_ref: '§3.1.3' } },
          { claim_id: 'c3', claim_text: 'LTV ratios may exceed thresholds', citation_status: 'unverifiable', source_location: null },
        ],
      },
      status: 'pending',
      queued_at: '2024-06-01T10:20:00Z',
      decided_at: null, decision: null, reviewer_id: null, justification: null,
    },
  ],
  match_rules: [
    {
      id: 'item-mr-1',
      run_id: 'run-001',
      item_type: 'proposed_update',
      payload: {
        summary: 'Update interest rate disclosure to match revised APR guidance',
        details: { target_section: '6.1', update_type: 'language', evaluation_method: 'llm' },
        source_citations: [{
          claim_id: 'c4',
          claim_text: 'Interest rates shall be disclosed in APR format',
          citation_status: 'grounded',
          source_location: { page_number: 22, section_id: 'sec-6.1', start_offset: 0, end_offset: 55, clause_ref: '§6.1.2' },
        }],
      },
      status: 'pending',
      queued_at: '2024-06-01T10:25:00Z',
      decided_at: null, decision: null, reviewer_id: null, justification: null,
    },
  ],
  score_confidence: [
    {
      id: 'item-sc-1',
      run_id: 'run-001',
      item_type: 'finding',
      payload: {
        summary: 'Missing fee schedule disclosure for Q3 2024 changes',
        details: { severity: 'low', rule_id: 'DISC-7.3', evaluation_method: 'structured' },
        source_citations: [
          { claim_id: 'c5', claim_text: 'Fee schedules updated March 2024', citation_status: 'unverifiable', source_location: null },
          { claim_id: 'c6', claim_text: 'Customers notified 30 days prior', citation_status: 'grounded', source_location: { page_number: 5, section_id: 'sec-7.3', start_offset: 200, end_offset: 270, clause_ref: null } },
        ],
      },
      status: 'pending',
      queued_at: '2024-06-01T10:30:00Z',
      decided_at: null, decision: null, reviewer_id: null, justification: null,
    },
  ],
};

const USE_MOCK = import.meta.env.VITE_MOCK_API === 'true';
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// ─── Citation component ──────────────────────────────────────────────────────

function CitationView({ citation, expanded, onToggle }: { citation: SourceCitation; expanded: boolean; onToggle: () => void }) {
  const isUnverifiable = citation.citation_status === 'unverifiable' || !citation.source_location;

  return (
    <div className="rounded-md border border-white/[0.06] bg-[#0f1320]/60 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        {isUnverifiable ? (
          <div className="flex items-center gap-1.5 flex-1">
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 9v4m0 3h.01M12 3l9.5 16.5H2.5L12 3z" />
              </svg>
              UNVERIFIABLE
            </span>
            <span className="text-xs text-white/50 truncate">{citation.claim_text}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-1">
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono text-emerald-300/80 bg-emerald-500/10 border border-emerald-500/20">
              {citation.source_location!.clause_ref ?? `p.${citation.source_location!.page_number}`}
            </span>
            <span className="text-xs text-white/50 truncate">{citation.claim_text}</span>
          </div>
        )}
        <svg className={`w-3.5 h-3.5 text-white/30 transition-transform flex-shrink-0 mt-0.5 ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && citation.source_location && (
        <div className="px-3 py-2 border-t border-white/[0.04] bg-[#0a0d16]">
          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Source Document · Page {citation.source_location.page_number}</div>
          <div className="text-sm text-white/60 leading-relaxed">
            <span className="text-white/30">...preceding text content... </span>
            <mark className="bg-indigo-500/20 text-indigo-200 px-0.5 rounded-sm border-b border-indigo-400/50">
              {citation.claim_text}
            </mark>
            <span className="text-white/30"> ...following text content...</span>
          </div>
          <div className="mt-1.5 flex gap-3 text-[10px] text-white/30">
            <span>Section: {citation.source_location.section_id ?? '—'}</span>
            <span>Offset: {citation.source_location.start_offset}–{citation.source_location.end_offset}</span>
          </div>
        </div>
      )}

      {expanded && !citation.source_location && (
        <div className="px-3 py-3 border-t border-rose-500/10 bg-rose-950/20">
          <div className="flex items-center gap-2 text-rose-300 text-xs">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M12 9v4m0 3h.01M12 3l9.5 16.5H2.5L12 3z" />
            </svg>
            <span>No source span available. This citation could not be traced to a specific document location. Manual verification required.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single item card ────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { border: string; badge: string }> = {
  finding: { border: 'border-l-rose-500', badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  conflict: { border: 'border-l-amber-500', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  proposed_update: { border: 'border-l-violet-500', badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
};

function ItemCard({ item, onDecision }: { item: QueueItem; onDecision: (id: string, decision: 'approved' | 'rejected') => void }) {
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'approved' | 'rejected' | null>(null);
  const colors = TYPE_COLORS[item.item_type] ?? TYPE_COLORS.finding;
  const evalMethod = (item.payload.details as Record<string, unknown>).evaluation_method as string | undefined;

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    setSubmitting(decision);
    await onDecision(item.id, decision);
    setSubmitting(null);
  };

  const isPending = item.status === 'pending';

  return (
    <div className={`rounded-lg border border-white/[0.06] bg-[#141927]/80 border-l-[3px] ${colors.border} overflow-hidden`}>
      {/* Header */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${colors.badge}`}>
            {item.item_type.replace('_', ' ')}
          </span>
          {evalMethod && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono uppercase text-white/30 bg-white/[0.03] border border-white/[0.08]">
              {evalMethod}
            </span>
          )}
          {!isPending && (
            <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              item.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
            }`}>
              {item.status === 'approved' ? '✓' : '✗'} {item.status}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-white/85 leading-snug">{item.payload.summary}</p>
      </div>

      {/* Citations */}
      <div className="px-3 pb-2 space-y-1.5">
        {item.payload.source_citations.map((cit) => (
          <CitationView
            key={cit.claim_id}
            citation={cit}
            expanded={expandedCitation === cit.claim_id}
            onToggle={() => setExpandedCitation(expandedCitation === cit.claim_id ? null : cit.claim_id)}
          />
        ))}
      </div>

      {/* Decision buttons */}
      {isPending && (
        <div className="flex border-t border-white/[0.04]">
          <button
            onClick={() => handleDecision('approved')}
            disabled={submitting !== null}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-40 border-r border-white/[0.04]"
          >
            {submitting === 'approved' ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" opacity={0.25} /><path d="M4 12a8 8 0 018-8" opacity={0.75} /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12l5 5L20 7" /></svg>
            )}
            Approve
          </button>
          <button
            onClick={() => handleDecision('rejected')}
            disabled={submitting !== null}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
          >
            {submitting === 'rejected' ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" opacity={0.25} /><path d="M4 12a8 8 0 018-8" opacity={0.75} /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
            )}
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface NodeDetailPanelProps {
  nodeId: string | null;
  nodeLabel: string;
  onClose: () => void;
}

export function NodeDetailPanel({ nodeId, nodeLabel, onClose }: NodeDetailPanelProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch items for this node
  useEffect(() => {
    if (!nodeId) return;
    setLoading(true);

    async function fetchItems() {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 200));
        setItems(MOCK_NODE_ITEMS[nodeId!] ?? []);
      } else {
        try {
          const res = await fetch(`${BASE_URL}/approval/runs/run-001/queue?node=${nodeId}`);
          if (res.ok) {
            const data = await res.json();
            setItems(data.items ?? []);
          }
        } catch {
          setItems([]);
        }
      }
      setLoading(false);
    }

    fetchItems();
  }, [nodeId]);

  // Handle decision — only updates the single item
  const handleDecision = useCallback(async (itemId: string, decision: 'approved' | 'rejected') => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 400));
      setItems((prev) => prev.map((item) =>
        item.id === itemId
          ? { ...item, status: decision, decision, decided_at: new Date().toISOString(), reviewer_id: 'current-user' }
          : item
      ));
    } else {
      try {
        await fetch(`${BASE_URL}/approval/items/${itemId}/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, reviewer_id: 'current-user', justification: `${decision} via pipeline canvas` }),
        });
        // Update only this item locally
        setItems((prev) => prev.map((item) =>
          item.id === itemId
            ? { ...item, status: decision, decision, decided_at: new Date().toISOString(), reviewer_id: 'current-user' }
            : item
        ));
      } catch {
        // Keep original state on failure
      }
    }
  }, []);

  const isOpen = nodeId !== null;
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const totalCount = items.length;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="absolute inset-0 bg-black/20 z-10" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`absolute top-0 right-0 h-full w-[420px] max-w-[90vw] z-20 bg-[#0c0f1a] border-l border-white/[0.06] shadow-2xl shadow-black/50 transform transition-transform duration-250 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {isOpen && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div>
                <h2 className="text-sm font-semibold text-white/90">{nodeLabel}</h2>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {totalCount === 0 ? 'No items' : `${pendingCount} pending · ${totalCount} total`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
                aria-label="Close panel"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <svg className="w-5 h-5 text-indigo-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" opacity={0.25} />
                    <path d="M4 12a8 8 0 018-8" opacity={0.75} />
                  </svg>
                </div>
              )}

              {!loading && items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg className="w-8 h-8 text-white/20 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M9 12h6M12 9v6" />
                  </svg>
                  <p className="text-xs text-white/30">No findings or items at this stage</p>
                </div>
              )}

              {!loading && items.map((item) => (
                <ItemCard key={item.id} item={item} onDecision={handleDecision} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default NodeDetailPanel;
