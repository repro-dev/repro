import type {
  BlueprintAnalysis,
  EdgeDefinition,
  FlowBuilder,
  LinterResult,
  NodeClass,
  NodeFunction,
  WorkflowBlueprint,
} from "./flowcraft-runtime";

import type { TransportCorrelation } from "@repro/autobot-core";

export type FlowcraftWorkflowId = "autobot-deliver-issue";

export type FlowcraftNodeId = "claim" | "reconcile" | "complete";

export interface FlowcraftWorkflowContext {
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  finished_at: string;
  transport: TransportCorrelation | null;
}

export type FlowcraftWorkflowDependencies = Record<string, never>;

export interface FlowcraftWorkflowDefinition {
  id: FlowcraftWorkflowId;
  version: string;
  description: string;
  flow: FlowBuilder<FlowcraftWorkflowContext, FlowcraftWorkflowDependencies>;
  runtime: unknown;
  blueprint: WorkflowBlueprint;
  analysis: BlueprintAnalysis;
  lint: LinterResult;
}

export interface FlowcraftWorkflowSummary {
  id: FlowcraftWorkflowId;
  version: string;
  description: string;
  node_ids: FlowcraftNodeId[];
  edge_count: number;
}

export interface FlowcraftValidationIssue {
  source: "analysis" | "lint";
  code: string;
  message: string;
  node_id: FlowcraftNodeId | null;
  edge: EdgeDefinition | null;
}

export interface FlowcraftValidationResult {
  workflow_id: FlowcraftWorkflowId;
  valid: boolean;
  analysis: BlueprintAnalysis;
  lint: LinterResult;
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

export type FlowcraftNodeImplementation = NodeFunction | NodeClass;
