export type Stage =
  | "prospect"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost"
  | "on_hold";

export type OpportunityType =
  | "new_business"
  | "upsell"
  | "renewal"
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

export interface Company {
  id: string;
  name: string;
  industry?: string;
  website?: string;
  country?: string;
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
  qualified: "Gekwalificeerd",
  proposal: "Voorstel",
  negotiation: "Onderhandeling",
  won: "Gewonnen",
  lost: "Verloren",
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
  new_business: "Nieuw",
  upsell: "Upsell",
  renewal: "Verlenging",
  project: "Project",
  retainer: "Retainer",
};

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  very_positive: "Zeer positief",
  positive: "Positief",
  neutral: "Neutraal",
  negative: "Negatief",
  very_negative: "Zeer negatief",
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
  active: "Actief",
  on_hold: "On Hold",
  completed: "Afgerond",
  cancelled: "Geannuleerd",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "Bezig",
  done: "Klaar",
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: "Gepland",
  in_progress: "Bezig",
  completed: "Afgerond",
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  not_sent: "Niet verzonden",
  draft: "Concept",
  sent: "Verzonden",
  viewed: "Bekeken",
  accepted: "Geaccepteerd",
  declined: "Afgewezen",
  expired: "Verlopen",
};
