import { resolveSessionUser, type SessionUser } from "@/lib/auth";
import { ensureTables, sql } from "@/lib/db";
import { formatOpportunityRow } from "@/lib/format";
import type { Company, Opportunity, Project } from "@/lib/types";

export type ProjectWithStats = Project & {
  task_count: number;
  done_count: number;
  pending_requests: number;
};

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
};

export type AppBootstrap = {
  user: SessionUser | null;
  companies: Company[];
  projects: ProjectWithStats[];
  users: ApiUser[];
  opportunities: Opportunity[];
};

export type AppListData = Omit<AppBootstrap, "user">;

async function fetchCompanies(): Promise<Company[]> {
  const { rows } = await sql`SELECT * FROM companies ORDER BY name`;
  return rows as Company[];
}

async function fetchProjects(): Promise<ProjectWithStats[]> {
  const { rows } = await sql`
    SELECT
      p.*,
      json_build_object('id', c.id, 'name', c.name, 'industry', c.industry, 'logo_url', c.logo_url) AS company,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.approved = true) AS task_count,
      (SELECT COUNT(*) FROM tasks t
        INNER JOIN milestones m ON m.id = t.milestone_id
        WHERE t.project_id = p.id AND t.approved = true AND LOWER(m.name) = 'done') AS done_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.created_by = 'client' AND t.approved = false) AS pending_requests
    FROM projects p
    LEFT JOIN companies c ON c.id = p.company_id
    ORDER BY p.updated_at DESC
  `;
  return rows as ProjectWithStats[];
}

async function fetchUsers(): Promise<ApiUser[]> {
  const { rows } = await sql`
    SELECT id, email, name, avatar_url FROM users ORDER BY name
  `;
  return rows as ApiUser[];
}

async function fetchOpportunities(): Promise<Opportunity[]> {
  const { rows } = await sql`
    SELECT
      o.*,
      o.expected_value * o.probability / 100 AS weighted_value,
      json_build_object(
        'id', c.id,
        'name', c.name,
        'industry', c.industry,
        'website', c.website,
        'country', c.country
      ) AS company
    FROM opportunities o
    LEFT JOIN companies c ON c.id = o.company_id
    ORDER BY o.updated_at DESC
  `;
  return rows.map((row) => formatOpportunityRow(row) as Opportunity);
}

/**
 * Session only — cheap enough to block the shell on, since the sidebar needs it.
 */
export async function prefetchSession(): Promise<SessionUser | null> {
  try {
    await ensureTables();
    return await resolveSessionUser();
  } catch (err) {
    console.error("prefetchSession failed", err);
    return null;
  }
}

/**
 * Shared list data for the client query cache. Streamed in after the shell so
 * the sidebar and page chrome paint without waiting on these queries.
 */
export async function prefetchListData(): Promise<AppListData | null> {
  try {
    await ensureTables();
    const [companies, projects, users, opportunities] = await Promise.all([
      fetchCompanies(),
      fetchProjects(),
      fetchUsers(),
      fetchOpportunities(),
    ]);
    return { companies, projects, users, opportunities };
  } catch (err) {
    console.error("prefetchListData failed", err);
    return null;
  }
}

/**
 * Load session + shared list data once for the app shell.
 * Seeds the client query cache so views skip the post-hydration waterfall.
 */
export async function prefetchAppBootstrap(): Promise<AppBootstrap | null> {
  try {
    await ensureTables();
    const [user, companies, projects, users, opportunities] = await Promise.all([
      resolveSessionUser(),
      fetchCompanies(),
      fetchProjects(),
      fetchUsers(),
      fetchOpportunities(),
    ]);
    return { user, companies, projects, users, opportunities };
  } catch (err) {
    console.error("prefetchAppBootstrap failed", err);
    return null;
  }
}
