/**
 * Compliance Report Panel — shows the final pipeline output as a readable report.
 * Slides up from the bottom when a pipeline run completes.
 */
import { useState, useEffect } from 'react';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface ReportData {
  run_id: string;
  ready: boolean;
  status: string;
  generated_at: string;
  document: {
    filename: string | null;
    classification: string;
    classification_confidence: number;
    text_length: number;
  };
  assessment: {
    overall_verdict: string;
    risk_level: string;
    risk_score: number;
    summary: string;
  };
  claims: {
    total: number;
    compliant: number;
    non_compliant: number;
    indeterminate: number;
    details: Array<{
      claim_id: string;
      claim_text: string;
      confidence: number;
      verdict: string;
      rule_id: string | null;
      needs_review: boolean;
    }>;
  };
  findings: {
    total: number;
    items: Array<Record<string, any>>;
    source_findings: Array<Record<string, any>>;
  };
  routing: {
    auto_approved: number;
    escalated: number;
    auto_rejected: number;
  };
  execution: {
    total_duration_ms: number;
    total_cost_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
    nodes_completed: number;
    nodes_skipped: number;
    nodes_failed: number;
  };
}

interface ReportPanelProps {
  runId: string | null;
  runStatus: string | null;
  onClose: () => void;
}

const VERDICT_STYLES: Record<string, string> = {
  'COMPLIANT': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'MOSTLY COMPLIANT': 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25',
  'REQUIRES REVIEW': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'NON-COMPLIANT': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

const RISK_COLORS: Record<string, string> = {
  'MINIMAL': 'text-emerald-400',
  'LOW': 'text-emerald-300',
  'MEDIUM': 'text-amber-300',
  'HIGH': 'text-rose-400',
};

export function ReportPanel({ runId, runStatus, onClose }: ReportPanelProps) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  // Fetch report when run completes
  useEffect(() => {
    if (!runId || (runStatus !== 'completed' && runStatus !== 'failed')) {
      setVisible(false);
      return;
    }

    setLoading(true);
    setVisible(true);

    fetch(`${BASE_URL}/runs/${runId}/report`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ready) {
          setReport(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId, runStatus]);

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] bg-[#0c0f1a] border-t border-white/[0.08] rounded-t-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0f1320]/80 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-base font-semibold text-white/90">Compliance Analysis Report</h2>
            {report?.document.filename && (
              <span className="text-sm text-white/40 ml-2">— {report.document.filename}</span>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <svg className="w-6 h-6 text-indigo-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" opacity={0.25} />
                <path d="M4 12a8 8 0 018-8" opacity={0.75} />
              </svg>
              <span className="ml-3 text-sm text-white/50">Generating report...</span>
            </div>
          )}

          {!loading && report && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Overall Assessment Card */}
              <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#141927] to-[#0f1320] p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <span className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-bold border ${VERDICT_STYLES[report.assessment.overall_verdict] ?? 'bg-white/10 text-white/60 border-white/20'}`}>
                      {report.assessment.overall_verdict}
                    </span>
                    <p className="mt-3 text-sm text-white/60 leading-relaxed max-w-xl">
                      {report.assessment.summary}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Risk Score</div>
                    <div className={`text-3xl font-bold ${RISK_COLORS[report.assessment.risk_level] ?? 'text-white/60'}`}>
                      {report.assessment.risk_score}
                    </div>
                    <div className={`text-xs font-medium ${RISK_COLORS[report.assessment.risk_level] ?? 'text-white/40'}`}>
                      {report.assessment.risk_level}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="Claims Extracted" value={report.claims.total} />
                <StatCard label="Compliant" value={report.claims.compliant} color="text-emerald-400" />
                <StatCard label="Non-Compliant" value={report.claims.non_compliant} color="text-rose-400" />
                <StatCard label="Needs Review" value={report.claims.indeterminate} color="text-amber-400" />
              </div>

              {/* Document Classification */}
              <div className="rounded-xl border border-white/[0.08] bg-[#141927]/60 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Document Classification</h3>
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center rounded-md bg-indigo-500/15 px-2.5 py-1 text-sm font-medium text-indigo-300 border border-indigo-500/25">
                    {report.document.classification.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm text-white/40">
                    {(report.document.classification_confidence * 100).toFixed(0)}% confidence
                  </span>
                  <span className="text-sm text-white/30">·</span>
                  <span className="text-sm text-white/30">
                    {report.document.text_length.toLocaleString()} characters analyzed
                  </span>
                </div>
              </div>

              {/* Findings */}
              {(report.findings.total > 0 || report.findings.source_findings.length > 0) && (
                <div className="rounded-xl border border-white/[0.08] bg-[#141927]/60 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
                    Findings ({report.findings.total + report.findings.source_findings.length})
                  </h3>
                  <div className="space-y-2">
                    {report.findings.items.map((f, i) => (
                      <FindingRow key={i} finding={f} />
                    ))}
                    {report.findings.source_findings.map((f, i) => (
                      <FindingRow key={`src-${i}`} finding={f} />
                    ))}
                  </div>
                </div>
              )}

              {/* Claims Table */}
              <div className="rounded-xl border border-white/[0.08] bg-[#141927]/60 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
                  Claim-by-Claim Analysis ({report.claims.total})
                </h3>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {report.claims.details.map((claim) => (
                    <div key={claim.claim_id} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-[#0a0d16]/60 border border-white/[0.03]">
                      <VerdictBadge verdict={claim.verdict} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-white/70 leading-snug">{claim.claim_text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono text-white/25">{claim.claim_id}</span>
                          {claim.rule_id && (
                            <span className="text-[10px] text-indigo-300/50">{claim.rule_id}</span>
                          )}
                          {claim.needs_review && (
                            <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">REVIEW</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-white/30 font-mono flex-shrink-0">
                        {(claim.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Routing Summary */}
              <div className="rounded-xl border border-white/[0.08] bg-[#141927]/60 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Routing Decisions</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center py-2 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20">
                    <div className="text-lg font-bold text-emerald-400">{report.routing.auto_approved}</div>
                    <div className="text-[10px] text-emerald-300/60 uppercase">Auto-Approved</div>
                  </div>
                  <div className="text-center py-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/20">
                    <div className="text-lg font-bold text-amber-400">{report.routing.escalated}</div>
                    <div className="text-[10px] text-amber-300/60 uppercase">Escalated</div>
                  </div>
                  <div className="text-center py-2 rounded-lg bg-rose-500/[0.06] border border-rose-500/20">
                    <div className="text-lg font-bold text-rose-400">{report.routing.auto_rejected}</div>
                    <div className="text-[10px] text-rose-300/60 uppercase">Auto-Rejected</div>
                  </div>
                </div>
              </div>

              {/* Execution Stats */}
              <div className="rounded-xl border border-white/[0.08] bg-[#141927]/60 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Execution Summary</h3>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-sm font-mono text-white/70">{(report.execution.total_duration_ms / 1000).toFixed(1)}s</div>
                    <div className="text-[10px] text-white/30">Duration</div>
                  </div>
                  <div>
                    <div className="text-sm font-mono text-white/70">${report.execution.total_cost_usd.toFixed(4)}</div>
                    <div className="text-[10px] text-white/30">Cost</div>
                  </div>
                  <div>
                    <div className="text-sm font-mono text-white/70">{(report.execution.total_input_tokens + report.execution.total_output_tokens).toLocaleString()}</div>
                    <div className="text-[10px] text-white/30">Tokens Used</div>
                  </div>
                  <div>
                    <div className="text-sm font-mono text-white/70">{report.execution.nodes_completed}/{report.execution.nodes_completed + report.execution.nodes_skipped + report.execution.nodes_failed}</div>
                    <div className="text-[10px] text-white/30">Nodes OK</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#141927]/60 p-3 text-center">
      <div className={`text-xl font-bold ${color ?? 'text-white/80'}`}>{value}</div>
      <div className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    compliant: 'bg-emerald-500/20 text-emerald-300',
    non_compliant: 'bg-rose-500/20 text-rose-300',
    indeterminate: 'bg-amber-500/20 text-amber-300',
    not_evaluated: 'bg-white/10 text-white/40',
  };
  return (
    <span className={`flex-shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${styles[verdict] ?? styles.not_evaluated}`}>
      {verdict === 'compliant' ? '✓' : verdict === 'non_compliant' ? '✗' : '?'}
    </span>
  );
}

function FindingRow({ finding }: { finding: Record<string, any> }) {
  const severity = finding.severity ?? 'medium';
  const sevColors: Record<string, string> = {
    high: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    low: 'bg-white/10 text-white/50 border-white/20',
  };

  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#0a0d16]/60 border border-white/[0.03]">
      <span className={`flex-shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase border ${sevColors[severity] ?? sevColors.medium}`}>
        {severity}
      </span>
      <div className="flex-1">
        <p className="text-[12px] text-white/60 leading-snug">
          {finding.description || finding.reason || finding.finding_type || '—'}
        </p>
        {finding.rule_id && (
          <span className="text-[10px] text-indigo-300/50">{finding.rule_id}</span>
        )}
      </div>
    </div>
  );
}

export default ReportPanel;
