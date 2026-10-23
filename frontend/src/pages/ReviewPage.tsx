import { useEffect, useRef, useCallback, useState } from "react";
import { useSearchParams, Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useQueueStore } from "@/stores/queueStore";
import { useRunProgressStore } from "@/stores/runProgressStore";
import { usePolling } from "@/hooks/usePolling";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { useFocusManagement } from "@/hooks/useFocusManagement";
import { submitItemDecision } from "@/services/decisionService";
import { fetchRuns } from "@/services/approvalApi";
import { applyFilters, applySorting } from "@/utils/filterSort";
import { DEFAULT_POLLING_INTERVAL_MS } from "@/utils/constants";
import { TopBar } from "@/components/review/TopBar";
import { ProgressStepper } from "@/components/review/ProgressStepper";
import { ConnectionLostBanner } from "@/components/review/ConnectionLostBanner";
import { MasterDetail } from "@/components/review/MasterDetail";
import { QueueList } from "@/components/review/QueueList";
import { DetailPanel } from "@/components/review/DetailPanel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { RunSummary } from "@/types/review";
import {
  LayoutDashboard,
  FileClock,
  MessagesSquare,
  ChevronsUpDown,
  ChevronLeft,
  UserCog,
  Blocks,
  Plus,
  Settings,
  UserCircle,
  LogOut,
} from "lucide-react";

const sidebarVariants = {
  open: { width: "18rem" },
  closed: { width: "3.35rem" },
};

const transitionProps = {
  type: "tween",
  ease: "easeOut",
  duration: 0.2,
} as const;

function ReviewSidebar({
  collapsed,
  onToggle,
  runs,
  selectedRunId,
  onSelectRun,
}: {
  collapsed: boolean;
  onToggle: () => void;
  runs: RunSummary[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}) {
  const location = useLocation();

  return (
    <motion.aside
      className="sidebar relative z-30 h-full shrink-0 border-r border-white/[0.08] bg-[#0c101d] flex flex-col select-none overflow-hidden"
      initial={collapsed ? "closed" : "open"}
      animate={collapsed ? "closed" : "open"}
      variants={sidebarVariants}
      transition={transitionProps}
    >
      {/* ─── Header: Org Selector & Collapse Toggle ─── */}
      <div className="flex h-[54px] w-full shrink-0 items-center border-b border-white/[0.08] px-2.5 justify-between">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-2 px-1.5 py-1 text-white/90 hover:bg-white/[0.06] hover:text-white"
            >
              <Avatar className="size-5 rounded shrink-0">
                <AvatarImage
                  src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80"
                  alt="Organization"
                />
                <AvatarFallback className="bg-indigo-600 text-[10px] text-white">O</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex items-center gap-1.5 text-left min-w-0">
                  <span className="text-xs font-semibold tracking-tight text-white/90 truncate max-w-[120px]">
                    Acme Financial
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-white/40 shrink-0" />
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-[#131828] border-white/[0.1] text-white">
            <DropdownMenuItem className="flex items-center gap-2 text-xs text-white/80 hover:text-white cursor-pointer">
              <UserCog className="h-4 w-4" /> Manage members
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-2 text-xs text-white/80 hover:text-white cursor-pointer">
              <Blocks className="h-4 w-4" /> Integrations
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/[0.08]" />
            <DropdownMenuItem className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer">
              <Plus className="h-4 w-4" /> Create or join organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={onToggle}
          className="flex items-center justify-center h-7 w-7 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft className={`h-4 w-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* ─── Primary Navigation ─── */}
      <div className="px-2 py-2 shrink-0 space-y-1 border-b border-white/[0.06]">
        <Link
          to={selectedRunId ? `/pipeline?runId=${selectedRunId}` : "/pipeline"}
          className={`flex h-8 items-center rounded-md px-2 transition ${
            location.pathname.includes("/pipeline")
              ? "bg-indigo-500/15 text-indigo-300 font-medium"
              : "text-white/60 hover:bg-white/[0.05] hover:text-white/90"
          }`}
          title="Pipeline Canvas"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0 text-indigo-400" />
          {!collapsed && <span className="ml-2.5 text-xs">Pipeline</span>}
        </Link>
        <Link
          to="/review"
          className={`flex h-8 items-center rounded-md px-2 transition ${
            location.pathname.includes("/review")
              ? "bg-indigo-500/15 text-indigo-300 font-medium"
              : "text-white/60 hover:bg-white/[0.05] hover:text-white/90"
          }`}
          title="Document Review"
        >
          <FileClock className="h-4 w-4 shrink-0 text-sky-400" />
          {!collapsed && <span className="ml-2.5 text-xs">Document Review</span>}
        </Link>
        <div
          className="flex h-8 items-center rounded-md px-2 text-white/60 hover:bg-white/[0.05] hover:text-white/90 transition cursor-pointer"
          title="AI Assistant (Beta)"
        >
          <MessagesSquare className="h-4 w-4 shrink-0 text-purple-400" />
          {!collapsed && (
            <div className="ml-2.5 flex items-center justify-between flex-1">
              <span className="text-xs">Chat</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-none bg-blue-500/15 text-blue-400 font-bold">
                BETA
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* ─── Runs Quick Switcher ─── */}
      <div className="flex-1 overflow-hidden min-h-0">
        {collapsed ? (
          <div className="flex flex-col items-center py-4 space-y-4 text-white/40">
            <button
              onClick={onToggle}
              className="p-2 rounded-md hover:bg-white/[0.06] hover:text-white transition relative"
              title="Runs"
            >
              <span className="w-2 h-2 rounded-full bg-indigo-400 absolute top-1.5 right-1.5 animate-pulse" />
              <FileClock className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <ScrollArea className="h-full px-3 py-3">
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45 block mb-2">
                  Review Runs ({runs.length})
                </span>
                <div className="space-y-1.5">
                  <div
                    onClick={() => onSelectRun("all")}
                    className={`group rounded-lg border px-2.5 py-2 cursor-pointer transition-all duration-150 ${
                      selectedRunId === "all"
                        ? "border-indigo-500/40 bg-indigo-500/[0.09] border-l-[3px] border-l-indigo-500 text-white"
                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] text-white/70"
                    }`}
                  >
                    <span className="text-xs font-medium block">All Pending Reviews</span>
                    <span className="text-[10px] text-white/40">Across all runs</span>
                  </div>

                  {runs.map((r) => {
                    const isActive = r.id === selectedRunId;
                    return (
                      <div
                        key={r.id}
                        onClick={() => onSelectRun(r.id)}
                        className={`group rounded-lg border px-2.5 py-2 cursor-pointer transition-all duration-150 ${
                          isActive
                            ? "border-indigo-500/40 bg-indigo-500/[0.09] border-l-[3px] border-l-indigo-500"
                            : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              r.status === "completed"
                                ? "bg-emerald-400"
                                : r.status === "paused"
                                  ? "bg-amber-400"
                                  : r.status === "failed"
                                    ? "bg-rose-400"
                                    : "bg-blue-400"
                            }`}
                          />
                          <span
                            className={`text-xs font-medium truncate ${
                              isActive ? "text-white/95" : "text-white/60 group-hover:text-white/80"
                            }`}
                          >
                            Run {r.id.slice(0, 8)}
                          </span>
                          <span className="ml-auto text-[10px] text-white/30 capitalize">
                            {r.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* ─── Footer: Settings & Account ─── */}
      <div className="p-2 border-t border-white/[0.08] shrink-0 space-y-1">
        <button
          onClick={onToggle}
          className="flex h-8 w-full items-center rounded-md px-2 text-white/60 hover:bg-white/[0.06] hover:text-white transition"
          title="Settings"
        >
          <Settings className="h-4 w-4 shrink-0 text-white/50" />
          {!collapsed && <span className="ml-2.5 text-xs">Settings</span>}
        </button>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-white/70 hover:bg-white/[0.06] hover:text-white transition"
              title="Account"
            >
              <Avatar className="size-5 shrink-0 rounded-full">
                <AvatarImage
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                  alt="Andrew Luo"
                />
                <AvatarFallback className="bg-indigo-600 text-[10px] text-white">AL</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <span className="text-xs font-medium text-left truncate flex-1">Andrew Luo</span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-white/40 shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" sideOffset={6} align="start" className="w-56 bg-[#131828] border-white/[0.1] text-white">
            <div className="flex items-center gap-2.5 p-2">
              <Avatar className="size-7 rounded-full">
                <AvatarImage
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                  alt="Andrew Luo"
                />
                <AvatarFallback className="bg-indigo-600 text-xs text-white">AL</AvatarFallback>
              </Avatar>
              <div className="flex flex-col text-left min-w-0">
                <span className="text-xs font-semibold text-white truncate">Andrew Luo</span>
                <span className="text-[11px] text-white/50 truncate">andrew@usehindsight.com</span>
              </div>
            </div>
            <DropdownMenuSeparator className="bg-white/[0.08]" />
            <DropdownMenuItem className="flex items-center gap-2 text-xs text-white/80 hover:text-white cursor-pointer">
              <UserCircle className="h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-2 text-xs text-rose-400 hover:text-rose-300 cursor-pointer">
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.aside>
  );
}

/**
 * ReviewPage — the main orchestrating component for the review interface.
 * Composes ReviewSidebar, TopBar, ProgressStepper, ConnectionLostBanner, and MasterDetail
 * (QueueList + DetailPanel). Connects stores, hooks, and services.
 *
 * Validates: Requirements 10.5, 7.2, 8.1
 */
export function ReviewPage() {
  // ─── Query Params ──────────────────────────────────────────────────────────
  const [searchParams] = useSearchParams();
  const queryRunId = searchParams.get("runId");

  // ─── Stores ────────────────────────────────────────────────────────────────
  const {
    items,
    total,
    pending,
    selectedItemId,
    optimisticStatuses,
    filters,
    sortBy,
    sortDirection,
    setRunId,
    selectItem,
    reset: resetQueue,
  } = useQueueStore();

  const {
    completedNodes,
    currentNode,
    runStatus,
    runs,
    selectedRunId,
    setRuns,
    setSelectedRunId,
  } = useRunProgressStore();

  // ─── Local State ───────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const listRef = useRef<HTMLElement>(null);
  const approveButtonRef = useRef<HTMLButtonElement>(null);
  const rejectButtonRef = useRef<HTMLButtonElement>(null);

  // ─── Derived Data ──────────────────────────────────────────────────────────
  const filteredItems = applyFilters(items, filters);
  const sortedItems = applySorting(filteredItems, sortBy, sortDirection);
  const selectedItem = sortedItems.find((item) => item.id === selectedItemId) ?? null;

  // ─── Polling ───────────────────────────────────────────────────────────────
  const { connectionLost } = usePolling({
    intervalMs: DEFAULT_POLLING_INTERVAL_MS,
    enabled: true,
    runId: selectedRunId,
  });

  // ─── Keyboard Navigation ──────────────────────────────────────────────────
  useKeyboardNavigation({
    items: sortedItems,
    selectedItemId,
    onSelectItem: selectItem,
    listRef,
    approveButtonRef,
    rejectButtonRef,
  });

  // ─── Focus Management ─────────────────────────────────────────────────────
  const { advanceFocusAfterDecision } = useFocusManagement({
    items: sortedItems,
    selectedItemId,
    onSelectItem: selectItem,
    listRef,
  });

  // ─── Effects ───────────────────────────────────────────────────────────────

  // Fetch available runs on mount
  useEffect(() => {
    async function loadRuns() {
      try {
        const availableRuns = await fetchRuns();
        setRuns(availableRuns);

        // Priority: URL query param > existing selectedRunId > first available run
        const targetRunId =
          (queryRunId && availableRuns.some((r) => r.id === queryRunId) ? queryRunId : null) ||
          selectedRunId ||
          (availableRuns.length > 0 ? availableRuns[0].id : null);

        if (targetRunId) {
          setSelectedRunId(targetRunId);
          setRunId(targetRunId);
        }
      } catch {
        // Runs will be empty; polling will retry
      }
    }
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryRunId]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectRun = useCallback(
    (runId: string) => {
      resetQueue();
      setSelectedRunId(runId);
      setRunId(runId);
    },
    [resetQueue, setSelectedRunId, setRunId]
  );

  const handleDecision = useCallback(
    async (decision: "approved" | "rejected", justification: string) => {
      if (!selectedItemId) return;

      setIsSubmitting(true);
      try {
        await submitItemDecision({
          itemId: selectedItemId,
          decision,
          reviewerId: "current-user", // placeholder until auth integration
          justification,
        });
        advanceFocusAfterDecision();
      } finally {
        setIsSubmitting(false);
      }
    },
    [selectedItemId, advanceFocusAfterDecision]
  );

  const handleBack = useCallback(() => {
    // On mobile, deselect item to show the list view
    useQueueStore.setState({ selectedItemId: null });
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen w-screen bg-[#0b0f19] text-white/90 overflow-hidden">
      <ReviewSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        runs={runs}
        selectedRunId={selectedRunId}
        onSelectRun={handleSelectRun}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Background radial gradient for depth */}
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.05),transparent_50%)] pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative flex flex-col h-full min-w-0">
          <TopBar
            runs={runs}
            selectedRunId={selectedRunId}
            runStatus={runStatus}
            onSelectRun={handleSelectRun}
          />

          {selectedRunId !== "all" && (
            <ProgressStepper
              completedNodes={completedNodes}
              currentNode={currentNode}
            />
          )}

          <ConnectionLostBanner connectionLost={connectionLost} />

          <main className="flex-1 overflow-hidden min-h-0">
            <MasterDetail
              hasSelection={selectedItemId !== null}
              onBack={handleBack}
              listPanel={
                <QueueList
                  items={sortedItems}
                  selectedItemId={selectedItemId}
                  optimisticStatuses={optimisticStatuses}
                  onSelectItem={selectItem}
                  total={total}
                  pending={pending}
                />
              }
              detailPanel={
                <DetailPanel
                  item={selectedItem}
                  onDecide={handleDecision}
                  isSubmitting={isSubmitting}
                />
              }
            />
          </main>
        </div>
      </div>
    </div>
  );
}

export default ReviewPage;
