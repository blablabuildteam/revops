export type Stage =
  | "prospect"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost"
  | "on_hold";

export type OpportunityType =
  | "new"
  | "project"
  | "retainer";

export type Sentiment =
  | "very_positive"
  | "positive"
  | "neutral"
  | "negative"
  | "very_negative";

export type ProposalStatus =
  | "not_sent"
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired";

export type ActivityType =
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "proposal"
  | "follow_up";

export type RetainerType = "none" | "fixed" | "commission";

export interface Company {
  id: string;
  name: string;
  industry?: string;
  website?: string;
  country?: string;
  retainer_type?: RetainerType;
  retainer_amount?: number;
  commission_pct?: number;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  company_id?: string;
  company?: Company;
  name: string;
  description?: string;
  type: OpportunityType;
  stage: Stage;
  probability: number;
  expected_value: number;
  actual_value: number;
  weighted_value: number;
  currency: string;
  sentiment: Sentiment;
  proposal_status?: ProposalStatus;
  proposal_url?: string;
  owner?: string;
  close_date?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  opportunity_id: string;
  type: ActivityType;
  title: string;
  notes?: string;
  date: string;
  created_at: string;
}

export type NewOpportunity = Omit<
  Opportunity,
  "id" | "weighted_value" | "created_at" | "updated_at" | "company"
>;

export const STAGE_LABELS: Record<Stage, string> = {
  prospect: "Prospect",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
  on_hold: "On Hold",
};

export const STAGE_ORDER: Stage[] = [
  "prospect",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
  "on_hold",
];

export const TYPE_LABELS: Record<OpportunityType, string> = {
  new: "New",
  project: "Project",
  retainer: "Retainer",
};

export function normalizeOpportunityType(type: string): OpportunityType {
  if (type === "new" || type === "project" || type === "retainer") return type;
  if (type === "new_business" || type === "upsell") return "new";
  if (type === "renewal") return "retainer";
  return "new";
}

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  very_positive: "Very positive",
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  very_negative: "Very negative",
};

export type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled";
export type TaskStatus = "open" | "in_progress" | "done";
export type MilestoneStatus = "pending" | "in_progress" | "completed";

export interface Project {
  id: string;
  opportunity_id?: string;
  company_id?: string;
  company?: Company;
  opportunity?: Opportunity;
  name: string;
  description?: string;
  status: ProjectStatus;
  share_token: string;
  client_name?: string;
  client_email?: string;
  start_date?: string;
  end_date?: string;
  milestones?: Milestone[];
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  position: number;
  status: MilestoneStatus;
  due_date?: string;
  tasks: Task[];
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  milestone_id?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  created_by: "team" | "client";
  approved: boolean;
  assignee?: string;
  due_date?: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: "Planned",
  in_progress: "In progress",
  completed: "Completed",
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  not_sent: "Not sent",
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};
