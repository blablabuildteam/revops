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

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  not_sent: "Niet verzonden",
  draft: "Concept",
  sent: "Verzonden",
  viewed: "Bekeken",
  accepted: "Geaccepteerd",
  declined: "Afgewezen",
  expired: "Verlopen",
};
