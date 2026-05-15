export type TransportCorrelation = Record<string, unknown>;

export type FlowcraftWorkflowId = "autobot-deliver-issue";

export type FlowcraftNodeId = "claim" | "reconcile" | "complete";

export type FlowcraftNodeKind = "task" | "terminal";

export interface FlowcraftNodeDefinition {
  id: FlowcraftNodeId;
  title: string;
  description: string;
  kind: FlowcraftNodeKind;
}

export interface FlowcraftEdgeDefinition {
  from: FlowcraftNodeId;
  to: FlowcraftNodeId;
  label?: string;
}

export interface FlowcraftWorkflowDefinition {
  id: FlowcraftWorkflowId;
  version: string;
  description: string;
  nodes: FlowcraftNodeDefinition[];
  edges: FlowcraftEdgeDefinition[];
}

export interface FlowcraftWorkflowSummary {
  id: FlowcraftWorkflowId;
  version: string;
  description: string;
  node_ids: FlowcraftNodeId[];
  edge_count: number;
}

export interface FlowcraftValidationIssue {
  code: string;
  message: string;
  node_id: FlowcraftNodeId | null;
  edge: FlowcraftEdgeDefinition | null;
}

export interface FlowcraftValidationResult {
  workflow_id: FlowcraftWorkflowId;
  valid: boolean;
  issues: FlowcraftValidationIssue[];
}

export interface FlowcraftPhaseEvent {
  phase: FlowcraftNodeId;
  type: string;
  state: "claimed" | "reconciling" | "completed";
  message: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

export interface FlowcraftExecutionPlan {
  workflow: FlowcraftWorkflowDefinition;
  execution_id: string;
  run_id: string;
  issue_id: string;
  started_at: string;
  finished_at: string;
  transport: TransportCorrelation | null;
  metadata: Record<string, unknown>;
  flowcraft_events: Array<{
    flowcraft_event_id: string;
    execution_id: string;
    node_id: FlowcraftNodeId;
    type: string;
    occurred_at: string;
    data: Record<string, unknown>;
  }>;
  domain_events: Array<{
    event_id: string;
    issue_id: string | null;
    run_id: string | null;
    type: string;
    state: "claimed" | "reconciling" | "completed";
    message: string;
    severity: "info";
    occurred_at: string;
    actor: string;
    transport: TransportCorrelation | null;
    data: Record<string, unknown>;
  }>;
}
