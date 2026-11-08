"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

type Role = "ADMIN" | "ASSISTANT" | "TEAM_LEADER" | "TECHNICIAN";
type User = {
  id: string;
  name: string;
  email?: string;
  role: Role;
  active?: boolean;
  phone?: string;
};
type View = "overview" | "planning" | "tickets" | "config";
type Category = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  fields: string[];
};
type Reason = { id: string; name: string; active?: boolean };
type CompanySettings = {
  companyName: string;
  supportPhone?: string;
  supportEmail?: string;
  timezone: string;
  ticketPrefix: string;
  businessHours?: string;
};
type WispHubSettings = {
  baseUrl: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
  updatedAt?: string;
};
type WispHubClient = {
  serviceId?: number;
  name: string;
  phone: string;
  email: string;
  document: string;
  address: string;
  population: string;
  ip: string;
  status: string;
  plan: string;
  installationCost?: string;
  zone: string;
  comments: string;
  coordinates: string | null;
  mapUrl: string | null;
};
type TicketStatus = "PENDING" | "IN_PROGRESS" | "RESOLVED";
type DailyTicketOutcome = "PENDING" | "DONE" | "NOT_DONE";
type ExecutionParticipant = {
  id: string;
  userId?: string | null;
  name: string;
  role: Role;
};
type DailyExecution = {
  id: string;
  workDate: string;
  outcome: DailyTicketOutcome;
  outcomeNote?: string | null;
  deferredTo?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  pendingReason?: Reason | null;
  completedBy?: { id: string; name: string } | null;
  participants: ExecutionParticipant[];
  dailyTeam: { id: string; name: string };
};
type Ticket = {
  id: string;
  number: number;
  title: string;
  description?: string;
  status: TicketStatus;
  pendingNote?: string;
  scheduledAt?: string;
  customFields: Record<string, unknown>;
  customer: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    document?: string;
    address?: string;
  };
  category: Category;
  assignedTo?: { id: string; name: string };
  pendingReason?: Reason;
  notes?: {
    id: string;
    body: string;
    createdAt: string;
    author?: { name: string };
    apiClient?: { name: string };
  }[];
  events?: {
    id: string;
    type: string;
    createdAt: string;
    actor?: { name: string };
    apiClient?: { name: string };
  }[];
  dailyTeamAssignments?: DailyExecution[];
};
type DailyTeamTicketAssignment = {
  id: string;
  workDate: string;
  outcome: DailyTicketOutcome;
  outcomeNote?: string | null;
  deferredTo?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  pendingReason?: Reason | null;
  completedBy?: { id: string; name: string } | null;
  participants: ExecutionParticipant[];
  ticket: Ticket;
};
type DailyTeam = {
  id: string;
  name: string;
  workDate: string;
  members: { technician: User }[];
  tickets: DailyTeamTicketAssignment[];
};
type DailyPlanningData = {
  date: string;
  today: string;
  teams: DailyTeam[];
  technicians: User[];
  unplannedTickets: Ticket[];
  pendingReasons: Reason[];
};

const statusLabels: Record<TicketStatus, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En curso",
  RESOLVED: "Realizado",
};
const outcomeLabels: Record<DailyTicketOutcome, string> = {
  PENDING: "Pendiente",
  DONE: "Realizado",
  NOT_DONE: "No se pudo",
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [allReasons, setAllReasons] = useState<Reason[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [wisphub, setWispHub] = useState<WispHubSettings | null>(null);
  const [wisphubEnabled, setWispHubEnabled] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TicketStatus | "ALL">("PENDING");
  const [newOpen, setNewOpen] = useState(false);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [planningRefresh, setPlanningRefresh] = useState(0);
  const selectedIdRef = useRef<string | null>(null);
  const syncInFlight = useRef(false);

  async function load() {
    const me = await api<User>("/auth/me");
    const requests: [Promise<Ticket[]>, Promise<Category[]>] = [
      api("/tickets"),
      api("/categories"),
    ];
    const [list, cats] = await Promise.all(requests);
    let team: User[] = [];
    let reasonCatalog: Reason[] = [];
    let companySettings: CompanySettings | null = null;
    let wispSettings: WispHubSettings | null = null;
    let wispEnabled = false;
    if (me.role === "ADMIN") {
      [team, reasonCatalog, companySettings, wispSettings] = await Promise.all([
        api<User[]>("/users"),
        api<Reason[]>("/categories/pending-reasons/all"),
        api<CompanySettings>("/categories/company/settings"),
        api<WispHubSettings>("/integrations/wisphub/settings"),
      ]);
      wispEnabled = wispSettings.enabled && wispSettings.apiKeyConfigured;
    } else if (me.role === "ASSISTANT" || me.role === "TEAM_LEADER") {
      const result = await Promise.all([
        api<User[]>("/technicians"),
        me.role === "ASSISTANT"
          ? api<{ enabled: boolean }>("/integrations/wisphub/status")
          : Promise.resolve({ enabled: false }),
      ]);
      team = result[0];
      wispEnabled = result[1].enabled;
    }
    setUser(me);
    if (me.role === "TECHNICIAN") setView("planning");
    setTickets(list);
    setCategories(cats);
    setAllReasons(reasonCatalog);
    setCompany(companySettings);
    setWispHub(wispSettings);
    setWispHubEnabled(wispEnabled);
    setUsers(team);
    setLoading(false);
  }

  async function refreshTickets(preferredId?: string) {
    const list = await api<Ticket[]>("/tickets");
    setTickets(list);
    const id = preferredId ?? selected?.id;
    if (id) await openTicket(id, list);
  }

  async function openTicket(id: string, source = tickets) {
    const summary = source.find((ticket) => ticket.id === id);
    if (summary) setSelected(summary);
    const detail = await api<Ticket>(`/tickets/${id}`);
    setSelected(detail);
  }

  useEffect(() => {
    // Session recovery is the only browser-side initialization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setLoading(false));
  }, []);
  useEffect(() => { selectedIdRef.current = selected?.id ?? null; }, [selected?.id]);
  async function silentRefresh() {
    if (!user || syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    try {
      const list = await api<Ticket[]>("/tickets", { cache: "no-store" });
      setTickets(list);
      const id = selectedIdRef.current;
      if (id) {
        const detail = await api<Ticket>(`/tickets/${id}`, { cache: "no-store" }).catch(() => null);
        if (detail && selectedIdRef.current === id) setSelected(detail);
      }
      setLastSync(Date.now());
      setSyncError(false);
      setPlanningRefresh((value) => value + 1);
    } catch { setSyncError(true); }
    finally { setSyncing(false); syncInFlight.current = false; }
  }
  useEffect(() => {
    if (!user) return;
    const refresh = () => { if (document.visibilityState === "visible" && navigator.onLine) void silentRefresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const onOnline = () => { setOnline(true); refresh(); };
    const onOffline = () => setOnline(false);
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading)
    return (
      <div className="boot">
        <span className="logo-mark">S</span>
        <p>Preparando tu jornada...</p>
      </div>
    );
  if (!user) return <Login onLogin={load} />;

  const filtered = tickets.filter((ticket) => {
    const text =
      `${ticket.number} ${ticket.title} ${ticket.customer.name} ${ticket.customer.phone ?? ""}`.toLowerCase();
    return (
      (status === "ALL" || ticket.status === status) &&
      text.includes(query.toLowerCase())
    );
  });
  const active = tickets.filter(
    (ticket) => ticket.status !== "RESOLVED",
  ).length;
  const technicians = users.filter(
    (member) => member.role === "TECHNICIAN" && member.active !== false,
  );

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  }

  return (
    <main className="app-shell">
      <Sidebar
        user={user}
        view={view}
        onView={(next) => {
          setView(next);
          setSelected(null);
        }}
        onPassword={() => setPasswordOpen(true)}
        onLogout={logout}
      />
      <section className="workspace">
        <Topbar
          user={user}
          showSearch={view === "tickets"}
          query={query}
          setQuery={setQuery}
          onNew={() => setNewOpen(true)}
          canCreate={
            (user.role === "ADMIN" || user.role === "ASSISTANT") &&
            (view === "overview" || view === "tickets")
          }
          syncing={syncing}
          syncError={syncError}
          online={online}
          lastSync={lastSync}
          onRefresh={() => void silentRefresh()}
        />
        {view === "overview" && user.role !== "TECHNICIAN" && (
          <Overview
            tickets={tickets}
            technicians={technicians}
            onOpen={(id) => {
              setView("tickets");
              openTicket(id);
            }}
          />
        )}
        {view === "planning" && <DailyPlanning user={user} refreshKey={planningRefresh} />}
        {view === "tickets" && (
          <div className={`tickets-layout ${selected ? "has-detail" : ""}`}>
            <TicketList
              tickets={filtered}
              user={user}
              selectedId={selected?.id}
              status={status}
              setStatus={setStatus}
              onOpen={openTicket}
              onChanged={refreshTickets}
            />
            {selected ? (
              <TicketDetail
                ticket={selected}
                user={user}
                technicians={technicians}
                onClose={() => setSelected(null)}
                onChanged={() => refreshTickets(selected.id)}
              />
            ) : (
              <TicketBlank count={filtered.length} />
            )}
          </div>
        )}
        {view === "config" && user.role === "ADMIN" && company && wisphub && (
          <Settings
            currentUser={user}
            categories={categories}
            reasons={allReasons}
            company={company}
            wisphub={wisphub}
            users={users}
            tickets={tickets}
            onNewEmployee={() => setEmployeeOpen(true)}
            onPassword={() => setPasswordOpen(true)}
            onChanged={load}
          />
        )}
      </section>
      {newOpen && (
        <NewTicket
          categories={categories.filter((category) => category.active)}
          technicians={technicians}
          wisphubEnabled={wisphubEnabled}
          onClose={() => setNewOpen(false)}
          onCreated={async (id) => {
            setNewOpen(false);
            setView("tickets");
            await refreshTickets(id);
          }}
        />
      )}
      {employeeOpen && (
        <NewEmployee
          onClose={() => setEmployeeOpen(false)}
          onCreated={async () => {
            setEmployeeOpen(false);
            await load();
          }}
        />
      )}
      {passwordOpen && <ChangePassword onClose={() => setPasswordOpen(false)} />}
      {error && <Toast message={error} close={() => setError("")} />}
    </main>
  );
}

function Sidebar({
  user,
  view,
  onView,
  onPassword,
  onLogout,
}: {
  user: User;
  view: string;
  onView: (view: View) => void;
  onPassword: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="logo-mark">S</span>
        <div>
          <strong>Sky</strong>
          <small>Soluciones</small>
        </div>
      </div>
      <nav className="main-nav">
        {user.role !== "TECHNICIAN" && <NavButton
          icon="home"
          label="Resumen"
          active={view === "overview"}
          onClick={() => onView("overview")}
        />}
        <NavButton
          icon="clipboard"
          label={user.role === "TECHNICIAN" ? "Mi jornada" : "Plan diario"}
          active={view === "planning"}
          onClick={() => onView("planning")}
        />
        <NavButton
          icon="ticket"
          label={user.role === "TECHNICIAN" ? "Mis tareas" : "Tickets"}
          active={view === "tickets"}
          onClick={() => onView("tickets")}
        />
        {user.role === "ADMIN" && (
          <NavButton
            icon="settings"
            label="Configuración"
            active={view === "config"}
            onClick={() => onView("config")}
          />
        )}
        {user.role !== "ADMIN" && <NavButton
          icon="lock"
          label="Contraseña"
          active={false}
          onClick={onPassword}
        />}
      </nav>
      <div className="sidebar-help">
        <Icon name="spark" />
        <strong>Todo bajo control</strong>
        <p>La operación de Sky en un solo lugar.</p>
      </div>
      <button className="profile" onClick={onLogout} title="Cerrar sesión">
        <Avatar name={user.name} />
        <span>
          <strong>{user.name}</strong>
          <small>{roleName(user.role)}</small>
        </span>
        <Icon name="logout" />
      </button>
    </aside>
  );
}

function Topbar({
  user,
  showSearch,
  query,
  setQuery,
  onNew,
  canCreate,
  syncing,
  syncError,
  online,
  lastSync,
  onRefresh,
}: {
  user: User;
  showSearch: boolean;
  query: string;
  setQuery: (value: string) => void;
  onNew: () => void;
  canCreate: boolean;
  syncing: boolean;
  syncError: boolean;
  online: boolean;
  lastSync: number | null;
  onRefresh: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <header className="topbar">
      <div>
        <p>
          {greeting()}, {user.name.split(" ")[0]}
        </p>
        <h1>¿Qué necesita atención hoy?</h1>
      </div>
      <div className="top-actions">
        <button className={`sync-button ${!online || syncError ? "off" : ""}`} aria-label="Actualizar datos" title={!online ? "Sin conexión" : syncError ? "No se pudo actualizar" : lastSync ? `Actualizado ${new Date(lastSync).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : "Actualizar"} disabled={syncing} onClick={onRefresh}><i /> <span>{!online ? "Sin conexión" : syncing ? "Actualizando" : syncError ? "Reintentar" : "Actualizar"}</span></button>
        {showSearch && <button className={`search-toggle ${query ? "active" : ""}`} aria-label="Buscar tickets" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)}><Icon name="search" /></button>}
        {showSearch && searchOpen && <label className="search search-expanded">
          <Icon name="search" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar ticket o cliente"
          />
          {query && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery("")}><Icon name="close" /></button>}
        </label>}
        {canCreate && (
          <button className="primary-button" onClick={onNew}>
            <Icon name="plus" />
            Nuevo ticket
          </button>
        )}
      </div>
    </header>
  );
}

function Overview({
  tickets,
  technicians,
  onOpen,
}: {
  tickets: Ticket[];
  technicians: User[];
  onOpen: (id: string) => void;
}) {
  const attention = tickets
    .filter((ticket) => ticket.status === "PENDING")
    .slice(0, 5);
  const metrics = [
    {
      label: "En operación",
      value: tickets.filter((t) => t.status !== "RESOLVED").length,
      note: "tickets activos",
      icon: "pulse",
      tone: "blue",
    },
    {
      label: "Trabajando ahora",
      value: tickets.filter((t) => t.status === "IN_PROGRESS").length,
      note: "visitas en curso",
      icon: "tool",
      tone: "green",
    },
    {
      label: "Necesitan ayuda",
      value: tickets.filter((t) => t.status === "PENDING").length,
      note: "con novedad",
      icon: "alert",
      tone: "orange",
    },
    {
      label: "Finalizados",
      value: tickets.filter((t) => t.status === "RESOLVED").length,
      note: "trabajos cerrados",
      icon: "check",
      tone: "purple",
    },
  ];
  return (
    <div className="page overview-page">
      <section className="metrics-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span className={`metric-icon ${metric.tone}`}>
              <Icon name={metric.icon} />
            </span>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <small>{metric.note}</small>
            </div>
          </article>
        ))}
      </section>
      <section className="overview-grid">
        <article className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Prioridad</span>
              <h2>Requieren atención</h2>
            </div>
            <span className="soft-count">{attention.length}</span>
          </div>
          {attention.length ? (
            <div className="attention-list">
              {attention.map((ticket) => (
                <button key={ticket.id} onClick={() => onOpen(ticket.id)}>
                  <StatusDot status={ticket.status} />
                  <span>
                    <strong>{ticket.customer.name}</strong>
                    <small>
                      TK-{ticket.number} · {ticket.title}
                    </small>
                  </span>
                  <StatusBadge status={ticket.status} />
                  <Icon name="chevron" />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon="check"
              title="Todo está al día"
              text="No hay tickets pendientes."
            />
          )}
        </article>
        <article className="panel team-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Equipo</span>
              <h2>Técnicos disponibles</h2>
            </div>
            <span className="online-dot">En línea</span>
          </div>
          <div className="team-list">
            {technicians.map((technician) => {
              const tasks = tickets.filter(
                (ticket) =>
                  ticket.assignedTo?.id === technician.id &&
                  ticket.status !== "RESOLVED",
              ).length;
              return (
                <div key={technician.id}>
                  <Avatar name={technician.name} />
                  <span>
                    <strong>{technician.name}</strong>
                  </span>
                  <b>
                    {tasks}
                    <small> activos</small>
                  </b>
                </div>
              );
            })}
            {!technicians.length && (
              <Empty
                icon="users"
                title="Sin técnicos"
                text="Agrégalos desde Configuración → Empleados."
              />
            )}
          </div>
        </article>
      </section>
      <section className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Actividad reciente</span>
            <h2>Últimos tickets</h2>
          </div>
          <button
            className="text-button"
            onClick={() => tickets[0] && onOpen(tickets[0].id)}
          >
            Ver todos <Icon name="arrow" />
          </button>
        </div>
        <div className="recent-table">
          <div className="table-head">
            <span>Ticket</span>
            <span>Cliente</span>
            <span>Servicio</span>
            <span>Técnico</span>
            <span>Estado</span>
          </div>
          {tickets.slice(0, 6).map((ticket) => (
            <button key={ticket.id} onClick={() => onOpen(ticket.id)}>
              <span className="ticket-code">TK-{ticket.number}</span>
              <span>
                <strong>{ticket.customer.name}</strong>
                <small>{ticket.customer.address || "Sin dirección"}</small>
              </span>
              <span>{ticket.category.name}</span>
              <span>{ticket.assignedTo?.name || "Sin asignar"}</span>
              <StatusBadge status={ticket.status} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function DailyPlanning({ user, refreshKey }: { user: User; refreshKey: number }) {
  const [date, setDate] = useState(todayValue());
  const [data, setData] = useState<DailyPlanningData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("unplanned");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [population, setPopulation] = useState("ALL");
  const [editor, setEditor] = useState<DailyTeam | "new" | null>(null);
  const [outcomeEditor, setOutcomeEditor] = useState<{ teamId: string; ticket: Ticket; outcome: "DONE" | "NOT_DONE" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const canManage = user.role === "ADMIN" || user.role === "TEAM_LEADER";

  async function loadPlanning(nextDate = date) {
    setData(await api<DailyPlanningData>(`/daily-planning?date=${nextDate}`));
    setSelected([]);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlanning(date).catch((caught) => setMessage((caught as Error).message));
    // Date is the query key for this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  useEffect(() => {
    if (!refreshKey || busy || editor) return;
    api<DailyPlanningData>(`/daily-planning?date=${date}`, { cache: "no-store" }).then((next) => {
      setData(next);
      setSelected((ids) => ids.filter((id) => next.unplannedTickets.some((ticket) => ticket.id === id)));
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  function moveDate(days: number) {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + days);
    setDate(localDateValue(next));
  }
  async function assign(teamId: string, ticketIds = selected, focusTeam = true) {
    if (!ticketIds.length) return;
    setBusy(true);
    try {
      await api(`/daily-teams/${teamId}/tickets`, { method: "POST", body: JSON.stringify({ ticketIds }) });
      setMessage(`${ticketIds.length} ticket${ticketIds.length === 1 ? "" : "s"} asignado${ticketIds.length === 1 ? "" : "s"}.`);
      await loadPlanning();
      if (focusTeam) setActiveTab(teamId);
    } catch (caught) { setMessage((caught as Error).message); }
    finally { setBusy(false); }
  }
  async function unassign(teamId: string, ticketId: string) {
    setBusy(true);
    try {
      await api(`/daily-teams/${teamId}/tickets/${ticketId}`, { method: "DELETE" });
      await loadPlanning();
    } catch (caught) { setMessage((caught as Error).message); }
    finally { setBusy(false); }
  }
  async function startVisit(teamId: string, ticketId: string) {
    setBusy(true);
    try {
      await api(`/daily-teams/${teamId}/tickets/${ticketId}/start`, { method: "POST" });
      setMessage("Visita iniciada.");
      await loadPlanning();
    } catch (caught) { setMessage((caught as Error).message); }
    finally { setBusy(false); }
  }
  function canExecute(team: DailyTeam, assignment: DailyTeamTicketAssignment) {
    const isToday = assignment.workDate.slice(0, 10) === data?.today;
    const allowed = user.role === "ADMIN" || user.role === "TEAM_LEADER" ||
      (user.role === "TECHNICIAN" && team.members.some((member) => member.technician.id === user.id));
    return isToday && allowed && assignment.outcome === "PENDING";
  }
  const teams = useMemo(() => data?.teams ?? [], [data]);
  const unplannedTickets = useMemo(() => data?.unplannedTickets ?? [], [data]);
  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const categories = useMemo(
    () => Array.from(new Map(unplannedTickets.map((ticket) => [ticket.category.id, ticket.category])).values()),
    [unplannedTickets],
  );
  const populations = useMemo(
    () => Array.from(new Set(unplannedTickets.map(ticketPopulation).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, "es")),
    [unplannedTickets],
  );
  const visibleTickets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return unplannedTickets.filter((ticket) => {
      const text = `${ticket.number} ${ticket.customer.name} ${ticket.customer.address ?? ""} ${ticket.title}`.toLowerCase();
      return text.includes(needle) &&
        (category === "ALL" || ticket.category.id === category) &&
        (population === "ALL" || ticketPopulation(ticket) === population);
    });
  }, [unplannedTickets, query, category, population]);
  const visibleIds = useMemo(() => visibleTickets.map((ticket) => ticket.id), [visibleTickets]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const occupiedIds = useMemo(
    () => new Set(teams.flatMap((team) => team.members.map((member) => member.technician.id))),
    [teams],
  );
  const activeTeamId = teams.some((team) => team.id === activeTab)
    ? activeTab
    : user.role === "TECHNICIAN" && teams[0]
      ? teams[0].id
      : "unplanned";

  function toggleSelected(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function toggleVisible() {
    const ids = new Set(visibleIds);
    setSelected((current) => visibleIds.every((id) => current.includes(id))
      ? current.filter((id) => !ids.has(id))
      : Array.from(new Set([...current, ...visibleIds])));
  }
  return (
    <div className="page planning-page">
      <header className="planning-header">
        <div>
          <span className="eyebrow">Operación diaria</span>
          <h2>Plan de cuadrillas</h2>
        </div>
        {canManage && <button className="primary-button" aria-label="Nueva cuadrilla" onClick={() => setEditor("new")}><Icon name="plus" /> Nueva cuadrilla</button>}
      </header>
      <section className="planning-date">
        <button aria-label="Día anterior" onClick={() => moveDate(-1)}><Icon name="back" /></button>
        <button className="today-button" onClick={() => setDate(todayValue())}>Hoy</button>
        <label><span>{formatPlanningDate(date)}</span><input type="date" aria-label="Fecha del plan" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} /></label>
        <button aria-label="Día siguiente" onClick={() => moveDate(1)}><Icon name="chevron" /></button>
      </section>
      <div className="planning-summary">
        <span><b>{teams.length}</b> cuadrillas</span>
        <span><b>{occupiedIds.size}</b> técnicos asignados</span>
        {user.role !== "TECHNICIAN" && <span><b>{unplannedTickets.length}</b> sin planificar</span>}
      </div>
      {canManage && <button className="planning-mobile-create" onClick={() => setEditor("new")}><Icon name="plus" /> Crear cuadrilla</button>}
      <nav className="planning-tabs" aria-label="Cuadrillas del día">
        {user.role !== "TECHNICIAN" && <button type="button" aria-current={activeTeamId === "unplanned" ? "true" : undefined} className={activeTeamId === "unplanned" ? "active" : ""} onClick={() => setActiveTab("unplanned")}>Sin planificar <b>{unplannedTickets.length}</b></button>}
        {teams.map((team) => <button type="button" aria-current={activeTeamId === team.id ? "true" : undefined} key={team.id} className={activeTeamId === team.id ? "active" : ""} onClick={() => setActiveTab(team.id)}>{team.name} <b>{team.tickets.length}</b></button>)}
      </nav>
      <div className="planning-layout">
        {user.role !== "TECHNICIAN" && <section className={`planning-unplanned ${activeTeamId !== "unplanned" ? "mobile-hidden" : ""}`} aria-label="Tickets sin planificar">
          <div className="planning-panel-head">
            <div>
              <span className="eyebrow">Por asignar</span>
              <h3>Sin planificar <b>{unplannedTickets.length}</b></h3>
            </div>
            {visibleTickets.length !== unplannedTickets.length && <small>{visibleTickets.length} visibles</small>}
          </div>
          <div className="planning-tools">
            <label className="search"><Icon name="search" /><input aria-label="Buscar tickets sin planificar" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, población o ticket" /></label>
            <select aria-label="Filtrar por categoría" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Todas las categorías</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select aria-label="Filtrar por población" value={population} onChange={(event) => setPopulation(event.target.value)}><option value="ALL">Todas las poblaciones</option>{populations.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </div>
          <div className="planning-list-toolbar">
            <span>{visibleTickets.length} ticket{visibleTickets.length === 1 ? "" : "s"}</span>
            {canManage && visibleTickets.length > 0 && <button className="text-button" onClick={toggleVisible}>{allVisibleSelected ? "Quitar visibles" : "Seleccionar visibles"}</button>}
          </div>
          {canManage && !teams.length && <button className="primary-button planning-first-team" onClick={() => setEditor("new")}><Icon name="plus" /> Crear primera cuadrilla</button>}
          <div className="planning-ticket-list">
            {visibleTickets.map((ticket) => {
              const checkboxId = `planning-ticket-${ticket.id}`;
              const lastAttempt = ticket.dailyTeamAssignments?.[0];
              const summary = <>
                <b>TK-{ticket.number}</b>
                <strong>{ticket.customer.name}</strong>
                <small>{ticket.customer.address || "Sin dirección"}</small>
                {lastAttempt?.outcome === "NOT_DONE" && <small className="retry-note">Reintento · {lastAttempt.pendingReason?.name || lastAttempt.outcomeNote || "No realizado"}</small>}
              </>;
              return <div className={`planning-ticket ${selectedIds.has(ticket.id) ? "selected" : ""}`} key={ticket.id}>
                {canManage && <input id={checkboxId} type="checkbox" checked={selectedIds.has(ticket.id)} onChange={() => toggleSelected(ticket.id)} aria-label={`Seleccionar TK-${ticket.number}`} />}
                {canManage
                  ? <label className="planning-ticket-main" htmlFor={checkboxId}>{summary}</label>
                  : <div className="planning-ticket-main">{summary}</div>}
                <div className="planning-ticket-actions">
                  <StatusBadge status={ticket.status} />
                  {canManage && teams.length > 0 && <select aria-label={`Asignar TK-${ticket.number} a una cuadrilla`} defaultValue="" disabled={busy} onChange={(event) => {
                    const teamId = event.target.value;
                    event.target.value = "";
                    if (teamId) assign(teamId, [ticket.id], false);
                  }}>
                    <option value="">Asignar...</option>
                    {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>}
                </div>
              </div>;
            })}
            {!visibleTickets.length && (unplannedTickets.length
              ? <Empty icon="search" title="Sin coincidencias" text="Ajusta la búsqueda o los filtros." />
              : <Empty icon="check" title="Todo planificado" text="No quedan tickets pendientes para este día." />)}
          </div>
        </section>}
        <section className={`planning-teams ${user.role !== "TECHNICIAN" && activeTeamId === "unplanned" ? "mobile-hidden" : ""}`} aria-label="Cuadrillas del día">
          {teams.map((team) => <article className={`daily-team ${activeTeamId === team.id ? "active" : ""}`} key={team.id}>
            <header>
              <div>
                <h3>{team.name}<span className="team-count">{team.tickets.length}</span></h3>
                <p className="team-members">{team.members.map((member) => member.technician.name).join(" · ") || "Sin integrantes"}</p>
              </div>
              {canManage && <button className="icon-button" aria-label={`Editar ${team.name}`} onClick={() => setEditor(team)}><Icon name="settings" /></button>}
            </header>
            {canManage && selected.length > 0 && <button className="assign-selected" disabled={busy} onClick={() => assign(team.id)}>Asignar {selected.length} seleccionado{selected.length === 1 ? "" : "s"}</button>}
            <div className="team-tickets">
              {team.tickets.map((assignment) => {
                const { ticket } = assignment;
                const lastAttempt = ticket.dailyTeamAssignments?.[0];
                const executable = canExecute(team, assignment);
                const directions = mapHref(ticket);
                return <div className="team-ticket" key={ticket.id}>
                  <div className="team-ticket-main">
                    <b>TK-{ticket.number} · {ticket.category.name}</b>
                    <strong>{ticket.customer.name}</strong>
                    <small>{ticket.customer.address || "Sin dirección"}</small>
                    {lastAttempt?.outcome === "NOT_DONE" && <small className="retry-note">Reintento · {lastAttempt.pendingReason?.name || lastAttempt.outcomeNote || "No realizado"}{lastAttempt.completedBy?.name ? ` · ${lastAttempt.completedBy.name}` : ""}</small>}
                    {assignment.outcome !== "PENDING" && <small className="execution-context">
                      {outcomeLabels[assignment.outcome]} · {assignment.completedBy?.name || "Sin actor"} · {assignment.completedAt ? formatDate(assignment.completedAt) : "Sin fecha"}
                      {assignment.pendingReason?.name ? ` · ${assignment.pendingReason.name}` : ""}
                      {assignment.outcomeNote ? ` · ${assignment.outcomeNote}` : ""}
                      {assignment.deferredTo ? ` · Reprogramado ${formatPlanningDate(assignment.deferredTo.slice(0, 10))}` : ""}
                    </small>}
                    {assignment.participants.length > 0 && <small className="execution-context">Participantes: {assignment.participants.map((participant) => participant.name).join(" · ")}</small>}
                  </div>
                  <div className="team-ticket-actions">
                    <StatusBadge status={ticket.status} />
                    {canManage && assignment.outcome === "PENDING" && <button disabled={busy} aria-label={`Retirar TK-${ticket.number} de ${team.name}`} onClick={() => unassign(team.id, ticket.id)}><Icon name="close" /></button>}
                  </div>
                  {executable && <div className="execution-actions" role="group" aria-label={`Acciones de TK-${ticket.number}`}>
                    {directions && <a className="execution-map" href={directions} target="_blank" rel="noreferrer" aria-label={`Cómo llegar a TK-${ticket.number}`}><Icon name="pin" /><span>Cómo llegar</span></a>}
                    {!assignment.startedAt
                      ? <button type="button" className="execution-start" disabled={busy} onClick={() => startVisit(team.id, ticket.id)}><Icon name="play" /><span>Iniciar trabajo</span></button>
                      : <>
                        <button type="button" className="success" disabled={busy} onClick={() => setOutcomeEditor({ teamId: team.id, ticket, outcome: "DONE" })}><Icon name="check" /><span>Realizado</span></button>
                        <button type="button" className="danger" disabled={busy} onClick={() => setOutcomeEditor({ teamId: team.id, ticket, outcome: "NOT_DONE" })}><Icon name="alert" /><span>No se pudo realizar</span></button>
                      </>}
                  </div>}
                </div>;
              })}
              {!team.tickets.length && <p className="team-empty">Aún no tiene trabajos asignados.</p>}
            </div>
          </article>)}
          {!teams.length && <Empty icon="users" title="Sin cuadrillas" text={canManage ? "Crea la primera cuadrilla para este día." : "No hay cuadrillas para este día."} />}
        </section>
      </div>
      {canManage && selected.length > 0 && <div className="planning-selection" role="region" aria-label="Asignación rápida">
        <span aria-live="polite"><b>{selected.length}</b> seleccionado{selected.length === 1 ? "" : "s"}</span>
        <div className="planning-selection-actions">
          <select aria-label="Asignar seleccionados a una cuadrilla" defaultValue="" onChange={(event) => {
            const teamId = event.target.value;
            event.target.value = "";
            if (teamId) assign(teamId);
          }} disabled={busy}>
            <option value="">Asignar a...</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <button className="icon-button" aria-label="Limpiar selección" onClick={() => setSelected([])}><Icon name="close" /></button>
        </div>
      </div>}
      {editor && data && <DailyTeamEditor team={editor} date={date} technicians={data.technicians} occupiedIds={occupiedIds} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await loadPlanning(); }} />}
      {outcomeEditor && data && <DailyOutcomeEditor teamId={outcomeEditor.teamId} ticket={outcomeEditor.ticket} initialOutcome={outcomeEditor.outcome} reasons={data.pendingReasons} onClose={() => setOutcomeEditor(null)} onSaved={async () => { setOutcomeEditor(null); await loadPlanning(); }} />}
      {message && <Toast message={message} close={() => setMessage("")} />}
    </div>
  );
}

function DailyTeamEditor({ team, date, technicians, occupiedIds, onClose, onSaved }: { team: DailyTeam | "new"; date: string; technicians: User[]; occupiedIds: Set<string>; onClose: () => void; onSaved: () => Promise<void> }) {
  const currentIds = team === "new" ? [] : team.members.map((member) => member.technician.id);
  const [name, setName] = useState(team === "new" ? "Nueva cuadrilla" : team.name);
  const [members, setMembers] = useState<string[]>(currentIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  async function save() {
    setSaving(true); setError("");
    try {
      await api(team === "new" ? "/daily-teams" : `/daily-teams/${team.id}`, { method: team === "new" ? "POST" : "PATCH", body: JSON.stringify(team === "new" ? { date, name, technicianIds: members } : { name, technicianIds: members }) });
      await onSaved();
    } catch (caught) { setError((caught as Error).message); setSaving(false); }
  }
  async function remove() {
    if (team === "new") return;
    setSaving(true);
    try { await api(`/daily-teams/${team.id}`, { method: "DELETE" }); await onSaved(); }
    catch (caught) { setError((caught as Error).message); setSaving(false); }
  }
  return <div className="planning-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="planning-sheet" role="dialog" aria-modal="true" aria-labelledby="daily-team-editor-title">
      <header>
        <div><span className="eyebrow">{formatPlanningDate(date)}</span><h2 id="daily-team-editor-title">{team === "new" ? "Nueva cuadrilla" : "Editar cuadrilla"}</h2></div>
        <button className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
      </header>
      <label className="field"><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="member-picker"><strong>Integrantes</strong>{technicians.map((technician) => {
        const occupied = occupiedIds.has(technician.id) && !currentIds.includes(technician.id);
        return <label className={occupied ? "occupied" : ""} key={technician.id}><input type="checkbox" disabled={occupied} checked={members.includes(technician.id)} onChange={() => setMembers((current) => current.includes(technician.id) ? current.filter((id) => id !== technician.id) : [...current, technician.id])} /><Avatar name={technician.name} /><span><b>{technician.name}</b><small>{occupied ? "Ya está en otra cuadrilla" : "Disponible"}</small></span></label>;
      })}</div>
      {error && <p className="form-error">{error}</p>}
      <footer>
        {team !== "new" && <button className="danger-button" disabled={saving} onClick={remove}>Eliminar</button>}
        <button className="primary-button" disabled={saving || !name.trim()} onClick={save}>{saving ? "Guardando..." : "Guardar cuadrilla"}</button>
      </footer>
    </section>
  </div>;
}

function DailyOutcomeEditor({ teamId, ticket, initialOutcome, reasons, onClose, onSaved }: { teamId: string; ticket: Ticket; initialOutcome: "DONE" | "NOT_DONE"; reasons: Reason[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [outcome, setOutcome] = useState<"DONE" | "NOT_DONE">(initialOutcome);
  const [note, setNote] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [deferredTo, setDeferredTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const trimmedNote = note.trim();
  const noteTooShort = trimmedNote.length > 0 && trimmedNote.length < 3;
  const missingContext = outcome === "NOT_DONE" && !trimmedNote && !reasonId;
  const invalid = missingContext || noteTooShort;
  const noteHelpId = "daily-outcome-note-help";
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (noteTooShort) { setError("La nota debe tener al menos 3 caracteres."); return; }
    if (missingContext) { setError("Indica un motivo o describe qué ocurrió (mínimo 3 caracteres)."); return; }
    setSaving(true); setError("");
    try {
      await api(`/daily-teams/${teamId}/tickets/${ticket.id}/outcome`, {
        method: "PATCH",
        body: JSON.stringify({
          outcome,
          note: trimmedNote || undefined,
          pendingReasonId: outcome === "NOT_DONE" && reasonId ? reasonId : undefined,
          deferredTo: outcome === "NOT_DONE" && deferredTo ? deferredTo : undefined,
        }),
      });
      await onSaved();
    } catch (caught) { setError((caught as Error).message); setSaving(false); }
  }
  return <div className="planning-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="planning-sheet outcome-sheet" role="dialog" aria-modal="true" aria-labelledby="daily-outcome-title" onSubmit={save}>
      <header>
        <div><span className="eyebrow">TK-{ticket.number} · {ticket.customer.name}</span><h2 id="daily-outcome-title">Resultado de la visita</h2></div>
        <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
      </header>
      <label className="field"><span>Resultado</span><select value={outcome} onChange={(event) => setOutcome(event.target.value as "DONE" | "NOT_DONE")}><option value="DONE">Realizado</option><option value="NOT_DONE">No se pudo</option></select></label>
      {outcome === "NOT_DONE" && <label className="field"><span>Motivo</span><select value={reasonId} onChange={(event) => setReasonId(event.target.value)}><option value="">Sin motivo</option>{reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label>}
      <label className="field"><span>{outcome === "NOT_DONE" ? "Nota" : "Nota (opcional)"}</span><textarea rows={3} minLength={3} maxLength={500} aria-invalid={invalid} aria-describedby={noteHelpId} value={note} onChange={(event) => setNote(event.target.value)} placeholder={outcome === "NOT_DONE" ? "Describe qué ocurrió" : "Observaciones de la visita"} /></label>
      {outcome === "NOT_DONE" && <label className="field"><span>Reprogramar para (opcional)</span><input type="date" value={deferredTo} onChange={(event) => setDeferredTo(event.target.value)} /></label>}
      {noteTooShort
        ? <p className="outcome-warning" id={noteHelpId} role="status">La nota debe tener al menos 3 caracteres.</p>
        : missingContext
          ? <p className="outcome-warning" id={noteHelpId} role="status">Indica un motivo o escribe al menos 3 caracteres explicando qué ocurrió.</p>
          : <p className="outcome-hint" id={noteHelpId}>{outcome === "NOT_DONE" ? "Indica un motivo o escribe al menos 3 caracteres explicando qué ocurrió." : "Puedes añadir una observación de al menos 3 caracteres."}</p>}
      <p className="outcome-hint">Quedará registrado quién realizó la visita y los participantes de la cuadrilla.</p>
      {error && <p className="form-error">{error}</p>}
      <footer>
        <button type="button" className="ghost-button" onClick={onClose}>Cancelar</button>
        <button className="primary-button" disabled={saving || invalid}>{saving ? "Guardando..." : "Guardar resultado"}</button>
      </footer>
    </form>
  </div>;
}

function TicketList({
  tickets,
  user,
  selectedId,
  status,
  setStatus,
  onOpen,
  onChanged,
}: {
  tickets: Ticket[];
  user: User;
  selectedId?: string;
  status: TicketStatus | "ALL";
  setStatus: (status: TicketStatus | "ALL") => void;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [copying, setCopying] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [failedTicket, setFailedTicket] = useState<string | null>(null);
  const [failureNote, setFailureNote] = useState("");
  const failureModalRef = useRef<HTMLElement>(null);
  const failureTriggerRef = useRef<HTMLButtonElement | null>(null);
  async function copyTicket(id: string) {
    setCopying(id);
    try {
      const ticket = await api<Ticket>(`/tickets/${id}`);
      await navigator.clipboard.writeText(formatTicketForClipboard(ticket));
      setCopyMessage(`TK-${ticket.number} copiado.`);
    } catch (caught) {
      setCopyMessage((caught as Error).message || "No se pudo copiar el ticket.");
    } finally {
      setCopying(null);
    }
  }
  async function copyPending() {
    setCopying("pending");
    try {
      const pending = await api<Ticket[]>("/tickets?status=PENDING");
      if (!pending.length) {
        setCopyMessage("No hay tickets pendientes.");
        return;
      }
      await navigator.clipboard.writeText(formatPendingReport(pending));
      setCopyMessage(`${pending.length} tickets pendientes copiados.`);
    } catch (caught) {
      setCopyMessage((caught as Error).message || "No se pudieron copiar los tickets.");
    } finally {
      setCopying(null);
    }
  }
  async function changeStatus(ticket: Ticket, next: TicketStatus) {
    if (ticket.status === next || changing) return;
    setChanging(ticket.id);
    try {
      await api(`/tickets/${ticket.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      if (next === "IN_PROGRESS" && status === "PENDING") setStatus("IN_PROGRESS");
      await onChanged();
    } catch (caught) {
      setCopyMessage((caught as Error).message || "No se pudo cambiar el estado.");
    } finally { setChanging(null); }
  }
  async function registerFailure(ticket: Ticket) {
    const note = failureNote.trim();
    if (note.length < 3 || changing) return;
    setChanging(ticket.id);
    try {
      await api(`/tickets/${ticket.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "PENDING", note }) });
      setFailedTicket(null);
      setFailureNote("");
      await onChanged();
    } catch (caught) {
      setCopyMessage((caught as Error).message || "No se pudo registrar el motivo.");
    } finally { setChanging(null); }
  }
  const failureTicket = tickets.find((ticket) => ticket.id === failedTicket);
  useEffect(() => {
    if (!failureTicket) return;
    const close = () => { setFailedTicket(null); failureTriggerRef.current?.focus(); };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !failureModalRef.current) return;
      const controls = Array.from(failureModalRef.current.querySelectorAll<HTMLElement>('button, textarea, [href], input, select, [tabindex]:not([tabindex="-1"])'));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [failureTicket]);
  return (
    <section className="ticket-column">
      <div className="list-header">
        <div>
          <span className="eyebrow">Bandeja de trabajo</span>
          <h2>
            Tickets <b>{tickets.length}</b>
          </h2>
        </div>
        <div className="list-actions">
          <button
            className="copy-pending-button"
            disabled={copying !== null}
            onClick={copyPending}
          >
            <Icon name="clipboard" />
            {copying === "pending" ? "Copiando..." : "Copiar pendientes"}
          </button>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as TicketStatus | "ALL")
            }
          >
            <option value="ALL">Todos los estados</option>
            {Object.entries(statusLabels).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="ticket-cards">
        {tickets.map((ticket) => (
          <article
            className={`ticket-card ${selectedId === ticket.id ? "selected" : ""}`}
            key={ticket.id}
          >
            <button className="ticket-card-main" onClick={() => onOpen(ticket.id)}>
              <div className="ticket-card-top">
                <span className="ticket-code">TK-{ticket.number}</span>
                <StatusBadge status={ticket.status} />
              </div>
              <strong>{ticket.customer.name}</strong>
              <p>{ticket.title}</p>
              <div className="ticket-meta">
                <span>
                  <Icon name="pin" />
                  {ticket.customer.address || "Sin dirección"}
                </span>
                <span>
                  <Icon name="user" />
                  {ticket.assignedTo?.name || "Sin asignar"}
                </span>
              </div>
            </button>
            <div className="ticket-card-actions">
              {mapHref(ticket) && <a className="ticket-work-map" href={mapHref(ticket)!} target="_blank" rel="noreferrer"><Icon name="pin" /> Cómo llegar</a>}
              {canChangeTicketStatus(user, ticket) && <div className="ticket-work-actions" role="group" aria-label={`Acciones de TK-${ticket.number}`}>
                {ticket.status === "PENDING" && <button className="start" type="button" disabled={changing === ticket.id} onClick={() => changeStatus(ticket, "IN_PROGRESS")}><Icon name="play" /> Iniciar trabajo</button>}
                {ticket.status === "IN_PROGRESS" && <button className="done" type="button" disabled={changing === ticket.id} onClick={() => changeStatus(ticket, "RESOLVED")}><Icon name="check" /> Realizado</button>}
                {ticket.status === "IN_PROGRESS" && <button className="failed" type="button" disabled={changing === ticket.id} onClick={(event) => { failureTriggerRef.current = event.currentTarget; setFailedTicket(ticket.id); setFailureNote(""); }}><Icon name="close" /> No se pudo realizar</button>}
              </div>}
            </div>
            <button
              className="ticket-copy-button"
              title={`Copiar TK-${ticket.number}`}
              aria-label={`Copiar TK-${ticket.number}`}
              disabled={copying !== null}
              onClick={() => copyTicket(ticket.id)}
            >
              <Icon name={copying === ticket.id ? "check" : "clipboard"} />
            </button>
          </article>
        ))}
        {!tickets.length && (
          <Empty
            icon="search"
            title="Sin resultados"
            text="Prueba otro término o estado."
          />
        )}
      </div>
      {failureTicket && <div className="ticket-failure-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setFailedTicket(null)}>
        <section ref={failureModalRef} className="ticket-failure-modal" role="dialog" aria-modal="true" aria-labelledby="ticket-failure-title">
          <header><div><span className="eyebrow">TK-{failureTicket.number}</span><h3 id="ticket-failure-title">No se pudo realizar</h3><p>{failureTicket.customer.name}</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setFailedTicket(null)}><Icon name="close" /></button></header>
          <label htmlFor={`failure-${failureTicket.id}`}>Explica qué ocurrió</label>
          <textarea id={`failure-${failureTicket.id}`} rows={4} minLength={3} maxLength={500} autoFocus value={failureNote} onChange={(event) => setFailureNote(event.target.value)} placeholder="Ej. Cliente ausente o sin acceso al lugar" />
          <small>Mínimo 3 caracteres. La explicación quedará en el historial.</small>
          <footer><button type="button" className="ghost-button" onClick={() => setFailedTicket(null)}>Cancelar</button><button type="button" className="primary-button" disabled={failureNote.trim().length < 3 || changing === failureTicket.id} onClick={() => registerFailure(failureTicket)}>{changing === failureTicket.id ? "Guardando..." : "Registrar motivo"}</button></footer>
        </section>
      </div>}
      {copyMessage && (
        <Toast message={copyMessage} close={() => setCopyMessage("")} />
      )}
    </section>
  );
}

function TicketDetail({
  ticket,
  user,
  technicians,
  onClose,
  onChanged,
}: {
  ticket: Ticket;
  user: User;
  technicians: User[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [statusError, setStatusError] = useState("");
  async function assign(id: string) {
    setBusy(true);
    await api(`/tickets/${ticket.id}/assignment`, {
      method: "PATCH",
      body: JSON.stringify({ technicianId: id }),
    });
    await onChanged();
    setBusy(false);
  }
  async function changeStatus(next: TicketStatus) {
    if (busy || next === ticket.status) return;
    setBusy(true);
    setStatusError("");
    try {
      await api(`/tickets/${ticket.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      await onChanged();
    } catch (caught) { setStatusError((caught as Error).message); }
    finally { setBusy(false); }
  }
  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    await api(`/tickets/${ticket.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: message }),
    });
    setMessage("");
    await onChanged();
    setBusy(false);
  }
  const canChangeStatus = canChangeTicketStatus(user, ticket);
  return (
    <section className="detail-panel">
      <div className="detail-hero">
        <button className="mobile-back" onClick={onClose}>
          <Icon name="back" />
        </button>
        <div>
          <span className="ticket-code">
            TK-{ticket.number} · {ticket.category.name}
          </span>
          <h2>{ticket.customer.name}</h2>
          <p>{ticket.title}</p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
      <div className="detail-scroll">
        {ticket.status === "PENDING" && (ticket.pendingReason?.name || ticket.pendingNote) && (
          <div className="pending-callout">
            <Icon name="alert" />
            <div>
              <strong>{ticket.pendingReason?.name}</strong>
              <p>{ticket.pendingNote}</p>
            </div>
          </div>
        )}
        <section className="detail-section">
          <div className="section-label">
            <span>Información del cliente</span>
            <Icon name="user" />
          </div>
          <div className="contact-card">
            <div>
              <Avatar name={ticket.customer.name} />
              <span>
                <strong>{ticket.customer.name}</strong>
                <small>
                  {ticket.customer.document || "Documento no registrado"}
                </small>
              </span>
            </div>
            <div className="contact-actions">
              {ticket.customer.phone && (
                <a href={`tel:${ticket.customer.phone}`}>
                  <Icon name="phone" />
                  {ticket.customer.phone}
                </a>
              )}
              {ticket.customer.address && (
                <a href={mapHref(ticket)!} target="_blank" rel="noreferrer">
                  <Icon name="pin" />
                  {ticket.customer.address}
                </a>
              )}
            </div>
          </div>
        </section>
        {canChangeStatus && (
          <section className="detail-section">
            <div className="section-label"><span>Estado del trabajo</span><Icon name="pulse" /></div>
            <div className="segmented status-quick" role="group" aria-label="Estado del trabajo">
              {(Object.keys(statusLabels) as TicketStatus[]).map((key) => <button key={key} type="button" className={ticket.status === key ? "active" : ""} aria-pressed={ticket.status === key} disabled={busy} onClick={() => changeStatus(key)}>{statusLabels[key]}</button>)}
            </div>
          </section>
        )}
        <section className="detail-section">
          <div className="section-label">
            <span>Trabajo solicitado</span>
            <Icon name="clipboard" />
          </div>
          <p className="description">
            {ticket.description || "Sin descripción adicional."}
          </p>
          {Object.keys(ticket.customFields || {}).length > 0 && (
            <>
              <div className="ticket-resource-actions">
                {mapHref(ticket) && <a className="custom-field-button" href={mapHref(ticket)!} target="_blank" rel="noreferrer"><Icon name="pin" />Cómo llegar</a>}
                {externalHref(ticket.customFields?.contrato) ? <a className="custom-field-button" href={externalHref(ticket.customFields.contrato)!} target="_blank" rel="noreferrer"><Icon name="link" />Ver contrato</a> : ticket.category.code === "installation" && <span className="resource-missing"><Icon name="link" />Contrato pendiente</span>}
              </div>
              <dl className="custom-fields">
              {Object.entries(ticket.customFields).filter(([key]) => key !== "mapa" && key !== "contrato").map(([key, value]) => {
                return <div key={key}>
                  <dt>{humanize(key)}</dt>
                  <dd>{String(value)}</dd>
                </div>;
              })}
              </dl>
            </>
          )}
        </section>
        {(user.role === "ADMIN" || user.role === "ASSISTANT") && (
          <section className="detail-section">
            <div className="section-label">
              <span>Técnico asignado</span>
              <Icon name="tool" />
            </div>
            <select
              className="assignment-select"
              disabled={busy || ticket.status === "RESOLVED"}
              value={ticket.assignedTo?.id || ""}
              onChange={(event) => assign(event.target.value)}
            >
              <option value="" disabled>
                Seleccionar técnico
              </option>
              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.name}
                </option>
              ))}
            </select>
          </section>
        )}
        <section className="detail-section">
          <div className="section-label">
            <span>Historial de ejecución</span>
            <Icon name="clipboard" />
          </div>
          <div className="execution-history">
            {ticket.dailyTeamAssignments?.map((execution) => (
              <article key={execution.id}>
                <header>
                  <strong>{formatPlanningDate(execution.workDate.slice(0, 10))} · {execution.dailyTeam.name}</strong>
                  <span className={`execution-badge ${execution.outcome.toLowerCase()}`}>{outcomeLabels[execution.outcome]}</span>
                </header>
                {execution.participants.length > 0 && <small>Participantes: {execution.participants.map((participant) => participant.name).join(" · ")}</small>}
                {execution.completedBy && <small>Registrado por {execution.completedBy.name}{execution.completedAt ? ` · ${formatDate(execution.completedAt)}` : ""}</small>}
                {execution.startedAt && <small>Iniciado {formatDate(execution.startedAt)}</small>}
                {(execution.pendingReason?.name || execution.outcomeNote) && <p>{[execution.pendingReason?.name, execution.outcomeNote].filter(Boolean).join(" · ")}</p>}
                {execution.deferredTo && <small>Reprogramado para {formatPlanningDate(execution.deferredTo.slice(0, 10))}</small>}
              </article>
            ))}
            {!ticket.dailyTeamAssignments?.length && <p className="muted">Sin ejecuciones diarias registradas.</p>}
          </div>
        </section>
        <section className="detail-section">
          <div className="section-label">
            <span>Notas y actividad</span>
            <Icon name="message" />
          </div>
          <div className="timeline">
            {ticket.notes?.map((note) => (
              <div key={note.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>
                    {note.author?.name || note.apiClient?.name || "Sistema"}
                  </strong>
                  <small>{formatDate(note.createdAt)}</small>
                  <p>{note.body}</p>
                </div>
              </div>
            ))}
            {!ticket.notes?.length && (
              <p className="muted">Todavía no hay notas.</p>
            )}
          </div>
          {(user.role === "ADMIN" || user.role === "ASSISTANT") && (
            <form className="note-form" onSubmit={addNote}>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Escribe una nota para el equipo..."
              />
              <button disabled={busy || !message.trim()}>
                <Icon name="send" />
              </button>
            </form>
          )}
        </section>
      </div>
      {statusError && <Toast message={statusError} close={() => setStatusError("")} />}
    </section>
  );
}

function NewTicket({
  categories,
  technicians,
  wisphubEnabled,
  onClose,
  onCreated,
}: {
  categories: Category[];
  technicians: User[];
  wisphubEnabled: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [lookupIp, setLookupIp] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [foundClient, setFoundClient] = useState<WispHubClient | null>(null);
  const [wispClients, setWispClients] = useState<WispHubClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const category = categories.find((item) => item.id === categoryId);
  function setGeneratedTitle(categoryName: string, client: WispHubClient) {
    const form = formRef.current;
    if (form) setFormValue(form, "title", [categoryName, client.population, client.name].filter(Boolean).join(" - "));
  }
  function applyWispClient(client: WispHubClient) {
    setFoundClient(client);
    const form = formRef.current;
    if (form) {
      setFormValue(form, "customerName", client.name);
      setFormValue(form, "phone", client.phone);
      setFormValue(form, "document", client.document);
      setFormValue(form, "address", client.address);
      setFormValue(form, "population", client.population);
      setFormValue(form, "field-ipCliente", client.ip);
      setFormValue(form, "field-cedula", client.document);
      setFormValue(form, "field-correo", client.email);
      setFormValue(form, "field-plan", client.plan);
      setFormValue(form, "field-valorInstalacion", client.installationCost ?? "");
      setFormValue(form, "field-mapa", client.mapUrl ?? "");
      setFormValue(form, "description", client.comments);
      setGeneratedTitle(category?.name ?? "", client);
    }
  }
  async function lookup() {
    if (!lookupIp.trim()) return;
    setLookingUp(true);
    setError("");
    setLookupError("");
    setFoundClient(null);
    try {
      const result = await api<{ found: boolean; client?: WispHubClient }>(
        "/integrations/wisphub/lookup",
        { method: "POST", body: JSON.stringify({ ip: lookupIp.trim() }) },
      );
      if (!result.found || !result.client) {
        setLookupError("No se encontró ningún cliente con esa IP en WispHub.");
        return;
      }
      applyWispClient(result.client);
    } catch (caught) {
      setLookupError((caught as Error).message);
    } finally {
      setLookingUp(false);
    }
  }
  async function loadWispClients() {
    if (wispClients.length || loadingClients) return;
    setLoadingClients(true);
    setError("");
    try {
      setWispClients(
        await api<WispHubClient[]>("/integrations/wisphub/installations"),
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoadingClients(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const customer = await api<{ id: string }>("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("customerName"),
          phone: form.get("phone") || undefined,
          document: form.get("document") || undefined,
          email: foundClient?.email || undefined,
          address: [form.get("address"), form.get("population")]
            .filter(Boolean)
            .join(", ") || undefined,
        }),
      });
      const customFields = Object.fromEntries(
        (category?.fields || [])
          .map((field) => [
            field,
            form.get(`field-${field}`) ||
              (
                {
                  ipCliente: foundClient?.ip,
                  correo: foundClient?.email,
                  plan: foundClient?.plan,
                  mapa: foundClient?.mapUrl,
                } as Record<string, string | null | undefined>
              )[field],
          ])
          .filter(([, value]) => value),
      );
      const ticket = await api<Ticket>("/tickets", {
        method: "POST",
        body: JSON.stringify({
          customerId: customer.id,
          categoryId,
          title: form.get("title"),
          description:
            form.get("description") || foundClient?.comments || undefined,
          assignedToId: form.get("technicianId") || undefined,
          scheduledAt: form.get("scheduledAt")
            ? new Date(String(form.get("scheduledAt"))).toISOString()
            : undefined,
          customFields,
        }),
      });
      await onCreated(ticket.id);
    } catch (caught) {
      setError((caught as Error).message);
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form ref={formRef} className="modal new-ticket-modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Nueva solicitud</span>
            <h2>Crear ticket</h2>
            <p>Registra al cliente y deja todo listo para el técnico.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="form-scroll">
          <fieldset>
            <legend>
              <span>1</span>¿Qué se va a realizar?
            </legend>
            <div className="category-picker">
              {categories.map((item) => (
                <button
                  type="button"
                  className={item.id === categoryId ? "active" : ""}
                  key={item.id}
                  onClick={() => {
                    setCategoryId(item.id);
                    const form = formRef.current;
                    if (form) setFormValue(form, "title", foundClient
                      ? [item.name, foundClient.population, foundClient.name].filter(Boolean).join(" - ")
                      : item.name);
                  }}
                >
                  <Icon name={categoryIcon(item.code)} />
                  {item.name}
                </button>
              ))}
            </div>
          </fieldset>
          {wisphubEnabled && <section className="wisphub-lookup">
            <div className="wisphub-brand"><span>W</span><div>
              <strong>{category?.code === "installation" ? "Seleccionar instalación de WispHub" : "Buscar cliente en WispHub"}</strong>
              <small>Opcional: completa automáticamente los datos del cliente.</small>
            </div></div>
            {category?.code === "installation" ? <label className="field"><span>Cliente</span><select defaultValue="" onFocus={loadWispClients} onChange={(event) => {
              const client = wispClients.find((item) => String(item.serviceId) === event.target.value);
              if (client) applyWispClient(client);
            }}><option value="">{loadingClients ? "Cargando clientes..." : "Seleccionar cliente"}</option>{wispClients.map((client) => <option key={client.serviceId} value={client.serviceId}>{client.name} · {client.document || client.ip || "Sin documento"}</option>)}</select></label> : <div className="lookup-row"><input value={lookupIp} onChange={(event) => setLookupIp(event.target.value)} placeholder="IP del cliente" inputMode="decimal" /><button type="button" disabled={lookingUp || !lookupIp.trim()} onClick={lookup}><Icon name="search" />{lookingUp ? "Buscando..." : "Consultar"}</button></div>}
            {lookupError && <p className="form-error">{lookupError}</p>}
            {foundClient && <div className="lookup-result"><Icon name="check" /><div><strong>{foundClient.name}</strong><span>{foundClient.plan || "Plan no informado"} · {foundClient.address || foundClient.status || "Datos cargados"}</span></div>{foundClient.mapUrl && <a href={foundClient.mapUrl} target="_blank" rel="noreferrer"><Icon name="pin" />Ver ubicación</a>}</div>}
          </section>}
          <fieldset>
            <legend><span>2</span>Datos del cliente</legend>
            <div className="form-grid">
              <Field label="Nombre completo" name="customerName" required />
              <Field label="Teléfono" name="phone" type="tel" />
              <Field label="Documento" name="document" />
              <Field label="Población" name="population" />
              <Field label="Dirección" name="address" wide />
            </div>
          </fieldset>
          <fieldset>
            <legend>
              <span>3</span>Datos adicionales del servicio
            </legend>
            <div className="form-grid">
              {category?.fields.map((field) => (
                <Field
                  key={field}
                  label={humanize(field)}
                  name={`field-${field}`}
                  type={field === "contrato" || field === "mapa" ? "url" : "text"}
                  required={category.code === "installation" && field === "contrato"}
                  placeholder={field === "contrato" ? "https://..." : undefined}
                />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>
              <span>4</span>Asunto y descripción
            </legend>
            <div className="form-grid">
              <Field
                label="Asunto"
                name="title"
                required
                readOnly
                wide
                defaultValue={category?.name}
                placeholder="Ej. Instalación de internet 10 MB"
              />
              <label className="field wide">
                <span>Descripción</span>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Detalles que debe conocer el técnico"
                />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>
              <span>5</span>Asignación
            </legend>
            <div className="form-grid">
              <label className="field">
                <span>Técnico</span>
                <select name="technicianId">
                  <option value="">Asignar más tarde</option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Fecha y hora"
                name="scheduledAt"
                type="datetime-local"
              />
            </div>
          </fieldset>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>
            {saving ? "Creando..." : "Crear ticket"}
            <Icon name="arrow" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Employees({
  currentUser,
  users,
  tickets,
  onNew,
  onChanged,
}: {
  currentUser: User;
  users: User[];
  tickets: Ticket[];
  onNew: () => void;
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<Role | "ALL">("ALL");
  const [resetting, setResetting] = useState<User | null>(null);
  const visible = users.filter(
    (member) => filter === "ALL" || member.role === filter,
  );
  const technicians = users.filter((member) => member.role === "TECHNICIAN");
  const assistants = users.filter((member) => member.role === "ASSISTANT");
  async function toggle(member: User) {
    await api(`/users/${member.id}/active`, {
      method: "PATCH",
      body: JSON.stringify({ active: member.active === false }),
    });
    await onChanged();
  }
  return (
    <div className="page employees-page">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">Equipo Sky</span>
          <h2>Empleados</h2>
          <p>Administra accesos, técnicos y personal de oficina.</p>
        </div>
        <button className="primary-button" onClick={onNew}>
          <Icon name="plus" />
          Nuevo empleado
        </button>
      </div>
      <section className="employee-metrics">
        <article>
          <span className="employee-metric-icon">
            <Icon name="users" />
          </span>
          <div>
            <strong>
              {users.filter((member) => member.active !== false).length}
            </strong>
            <p>Empleados activos</p>
          </div>
        </article>
        <article>
          <span className="employee-metric-icon tech">
            <Icon name="tool" />
          </span>
          <div>
            <strong>
              {technicians.filter((member) => member.active !== false).length}
            </strong>
            <p>Técnicos disponibles</p>
          </div>
        </article>
        <article>
          <span className="employee-metric-icon office">
            <Icon name="clipboard" />
          </span>
          <div>
            <strong>
              {assistants.filter((member) => member.active !== false).length}
            </strong>
            <p>Personal de oficina</p>
          </div>
        </article>
      </section>
      <section className="panel employees-panel">
        <div className="employees-toolbar">
          <div className="segmented">
            <button
              className={filter === "ALL" ? "active" : ""}
              onClick={() => setFilter("ALL")}
            >
              Todos
            </button>
            <button
              className={filter === "TECHNICIAN" ? "active" : ""}
              onClick={() => setFilter("TECHNICIAN")}
            >
              Técnicos
            </button>
            <button
              className={filter === "ASSISTANT" ? "active" : ""}
              onClick={() => setFilter("ASSISTANT")}
            >
              Asistentes
            </button>
            <button
              className={filter === "TEAM_LEADER" ? "active" : ""}
              onClick={() => setFilter("TEAM_LEADER")}
            >
              Líderes
            </button>
          </div>
          <span>{visible.length} personas</span>
        </div>
        <div className="employee-grid">
          {visible.map((member) => {
            const activeTasks = tickets.filter(
              (ticket) =>
                ticket.assignedTo?.id === member.id &&
                ticket.status !== "RESOLVED",
            ).length;
            return (
              <article
                className={member.active === false ? "employee-inactive" : ""}
                key={member.id}
              >
                <div className="employee-card-head">
                  <Avatar name={member.name} />
                  <span
                    className={`availability ${member.active === false ? "off" : ""}`}
                  >
                    {member.active === false ? "Inactivo" : "Activo"}
                  </span>
                </div>
                <h3>{member.name}</h3>
                <span className="role-pill">
                  <Icon
                    name={
                      member.role === "TECHNICIAN"
                        ? "tool"
                        : member.role === "ADMIN"
                          ? "settings"
                          : member.role === "TEAM_LEADER"
                            ? "users"
                            : "clipboard"
                    }
                  />
                  {roleName(member.role)}
                </span>
                <dl>
                  <div>
                    <dt>Correo</dt>
                    <dd>{member.email || "Sin correo"}</dd>
                  </div>
                  <div>
                    <dt>Teléfono</dt>
                    <dd>{member.phone || "Sin teléfono"}</dd>
                  </div>
                  {member.role === "TECHNICIAN" && (
                    <div>
                      <dt>Trabajo actual</dt>
                      <dd>{activeTasks} tickets activos</dd>
                    </div>
                  )}
                </dl>
                <button
                  className="employee-toggle"
                  onClick={() => toggle(member)}
                >
                  {member.active === false
                    ? "Activar empleado"
                    : "Desactivar acceso"}
                </button>
                {member.id !== currentUser.id && <button
                  className="employee-toggle employee-reset"
                  onClick={() => setResetting(member)}
                >
                  Restablecer contraseña
                </button>}
              </article>
            );
          })}
        </div>
      </section>
      {resetting && (
        <ResetPassword
          member={resetting}
          onClose={() => setResetting(null)}
        />
      )}
    </div>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
        }),
      });
      setSaved(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal pending-modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Seguridad</span>
            <h2>Cambiar mi contraseña</h2>
            <p>Confirma tu contraseña actual antes de cambiarla.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        <label className="field">
          <span>Contraseña actual *</span>
          <input name="currentPassword" type="password" autoComplete="current-password" required />
        </label>
        <label className="field">
          <span>Nueva contraseña *</span>
          <input name="newPassword" type="password" autoComplete="new-password" minLength={8} required placeholder="Mínimo 8 caracteres" />
        </label>
        {saved && <p className="connection-success"><Icon name="check" />Contraseña actualizada.</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            {saved ? "Cerrar" : "Cancelar"}
          </button>
          <button className="primary-button" disabled={saving || saved}>
            {saving ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ResetPassword({ member, onClose }: { member: User; onClose: () => void }) {
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/users/${member.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ newPassword: form.get("newPassword") }),
      });
      setSaved(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal pending-modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Administración</span>
            <h2>Restablecer contraseña</h2>
            <p>{member.name} recibirá una nueva contraseña temporal.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        <label className="field">
          <span>Nueva contraseña *</span>
          <input name="newPassword" type="password" autoComplete="new-password" minLength={8} required placeholder="Mínimo 8 caracteres" />
        </label>
        <p className="form-help">
          Comparte la contraseña con la persona por un canal seguro.
        </p>
        {saved && <p className="connection-success"><Icon name="check" />Contraseña restablecida.</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            {saved ? "Cerrar" : "Cancelar"}
          </button>
          <button className="primary-button" disabled={saving || saved}>
            {saving ? "Guardando..." : "Restablecer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function NewEmployee({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [role, setRole] = useState<Role>("TECHNICIAN");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          phone: form.get("phone") || undefined,
          role,
        }),
      });
      await onCreated();
    } catch (caught) {
      setError((caught as Error).message);
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal employee-modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Nuevo integrante</span>
            <h2>Crear empleado</h2>
            <p>La persona podrá ingresar con su correo y contraseña.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="employee-form-body">
          <label className="field">
            <span>Tipo de empleado</span>
            <div className="role-selector">
              <button
                type="button"
                className={role === "TECHNICIAN" ? "active" : ""}
                onClick={() => setRole("TECHNICIAN")}
              >
                <Icon name="tool" />
                <span>
                  <strong>Técnico</strong>
                  <small>Ejecuta tareas asignadas</small>
                </span>
              </button>
              <button
                type="button"
                className={role === "TEAM_LEADER" ? "active" : ""}
                onClick={() => setRole("TEAM_LEADER")}
              >
                <Icon name="users" />
                <span>
                  <strong>Líder de equipo</strong>
                  <small>Organiza cuadrillas y trabajos</small>
                </span>
              </button>
              <button
                type="button"
                className={role === "ASSISTANT" ? "active" : ""}
                onClick={() => setRole("ASSISTANT")}
              >
                <Icon name="clipboard" />
                <span>
                  <strong>Asistente</strong>
                  <small>Gestiona clientes y tickets</small>
                </span>
              </button>
            </div>
          </label>
          <div className="form-grid">
            <Field label="Nombre completo" name="name" required wide />
            <Field
              label="Correo electrónico"
              name="email"
              type="email"
              required
            />
            <Field label="Teléfono" name="phone" type="tel" />
            <Field
              label="Contraseña temporal"
              name="password"
              type="password"
              required
              wide
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>
            {saving ? "Creando..." : "Crear empleado"}
            <Icon name="arrow" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Settings({
  currentUser,
  categories,
  reasons,
  company,
  wisphub,
  users,
  tickets,
  onNewEmployee,
  onPassword,
  onChanged,
}: {
  currentUser: User;
  categories: Category[];
  reasons: Reason[];
  company: CompanySettings;
  wisphub: WispHubSettings;
  users: User[];
  tickets: Ticket[];
  onNewEmployee: () => void;
  onPassword: () => void;
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<
    "employees" | "services" | "reasons" | "company" | "integrations" | "security"
  >("services");
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/categories", {
        method: "POST",
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          fields: parseFields(form.get("fields")),
        }),
      });
      event.currentTarget.reset();
      setError("");
      await onChanged();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }
  async function toggle(category: Category) {
    await api(`/categories/${category.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !category.active }),
    });
    await onChanged();
  }
  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    await api(`/categories/${editing.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.get("name"),
        fields: parseFields(form.get("fields")),
      }),
    });
    setEditing(null);
    await onChanged();
  }
  async function addReason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/categories/pending-reasons", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name") }),
      });
      event.currentTarget.reset();
      setError("");
      await onChanged();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }
  async function toggleReason(reason: Reason) {
    await api(`/categories/pending-reasons/${reason.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: reason.active === false }),
    });
    await onChanged();
  }
  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/categories/company/settings", {
        method: "PATCH",
        body: JSON.stringify({
          companyName: form.get("companyName"),
          supportPhone: form.get("supportPhone") || undefined,
          supportEmail: form.get("supportEmail") || undefined,
          timezone: form.get("timezone"),
          ticketPrefix: String(form.get("ticketPrefix")).toUpperCase(),
          businessHours: form.get("businessHours") || undefined,
        }),
      });
      setError("");
      await onChanged();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }
  async function saveWispHub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/integrations/wisphub/settings", {
        method: "PATCH",
        body: JSON.stringify({
          baseUrl: form.get("baseUrl"),
          apiKey: form.get("apiKey") || undefined,
          enabled: form.get("enabled") === "on",
        }),
      });
      setError("");
      setConnectionMessage("Configuración guardada.");
      await onChanged();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }
  async function testWispHub() {
    setConnectionMessage("Probando conexión...");
    setError("");
    try {
      const result = await api<{ message: string }>(
        "/integrations/wisphub/test",
        { method: "POST" },
      );
      setConnectionMessage(result.message);
    } catch (caught) {
      setConnectionMessage("");
      setError((caught as Error).message);
    }
  }
  return (
    <div className="page settings-page">
      <div className="settings-title">
        <div>
          <span className="eyebrow">Administración</span>
          <h2>Configuración</h2>
          <p>
            Define cómo funciona Sky Ticket. Solo administradores pueden entrar
            aquí.
          </p>
        </div>
        <span className="admin-only">
          <Icon name="lock" />
          Acceso restringido
        </span>
      </div>
      <div className="settings-shell">
        <nav className="settings-nav">
          <button
            className={tab === "employees" ? "active" : ""}
            onClick={() => setTab("employees")}
          >
            <Icon name="users" />
            <span>
              <strong>Empleados</strong>
              <small>Accesos y equipo</small>
            </span>
          </button>
          <button
            className={tab === "services" ? "active" : ""}
            onClick={() => setTab("services")}
          >
            <Icon name="ticket" />
            <span>
              <strong>Servicios</strong>
              <small>Categorías y campos</small>
            </span>
          </button>
          <button
            className={tab === "reasons" ? "active" : ""}
            onClick={() => setTab("reasons")}
          >
            <Icon name="alert" />
            <span>
              <strong>Motivos de novedad</strong>
              <small>Opciones para pendientes</small>
            </span>
          </button>
          <button
            className={tab === "company" ? "active" : ""}
            onClick={() => setTab("company")}
          >
            <Icon name="home" />
            <span>
              <strong>Datos de empresa</strong>
              <small>Contacto y operación</small>
            </span>
          </button>
          <button
            className={tab === "integrations" ? "active" : ""}
            onClick={() => setTab("integrations")}
          >
            <Icon name="link" />
            <span>
              <strong>Integraciones</strong>
              <small>WispHub y servicios externos</small>
            </span>
          </button>
          <button
            className={tab === "security" ? "active" : ""}
            onClick={() => setTab("security")}
          >
            <Icon name="lock" />
            <span>
              <strong>Seguridad</strong>
              <small>Contraseña y permisos</small>
            </span>
          </button>
        </nav>
        <section className="settings-content">
          {tab === "employees" && (
            <Employees
              currentUser={currentUser}
              users={users}
              tickets={tickets}
              onNew={onNewEmployee}
              onChanged={onChanged}
            />
          )}
          {tab === "services" && (
            <>
              <div className="settings-section-head">
                <div>
                  <h3>Tipos de servicio</h3>
                  <p>
                    Controlan los formularios que usa la oficina al crear
                    tickets.
                  </p>
                </div>
                <span>
                  {categories.filter((item) => item.active).length} activos
                </span>
              </div>
              <div className="service-config-grid">
                <div className="config-items">
                  {categories.map((category) => (
                    <article
                      className={category.active ? "" : "disabled"}
                      key={category.id}
                    >
                      <span className="category-symbol">
                        <Icon name={categoryIcon(category.code)} />
                      </span>
                      <span>
                        <strong>{category.name}</strong>
                        <small>
                          {category.fields?.length || 0} campos · código:{" "}
                          {category.code}
                        </small>
                      </span>
                      <button
                        className="small-edit"
                        onClick={() => setEditing(category)}
                      >
                        Editar
                      </button>
                      <button
                        className={`switch ${category.active ? "on" : ""}`}
                        onClick={() => toggle(category)}
                        aria-label={category.active ? "Desactivar" : "Activar"}
                      >
                        <i />
                      </button>
                    </article>
                  ))}
                </div>
                <form className="config-form" onSubmit={add}>
                  <span className="eyebrow">Nuevo servicio</span>
                  <h3>Agregar categoría</h3>
                  <Field
                    label="Nombre visible"
                    name="name"
                    required
                    placeholder="Ej. Soporte empresarial"
                  />
                  <Field
                    label="Código interno"
                    name="code"
                    required
                    placeholder="soporte-empresarial"
                  />
                  <Field
                    label="Campos del formulario"
                    name="fields"
                    placeholder="ipCliente, plan, contacto"
                  />
                  <p className="form-help">
                    Los campos se separan con comas. Usa nombres cortos sin
                    caracteres especiales.
                  </p>
                  {error && <p className="form-error">{error}</p>}
                  <button className="primary-button">Guardar servicio</button>
                </form>
              </div>
            </>
          )}
          {tab === "reasons" && (
            <>
              <div className="settings-section-head">
                <div>
                  <h3>Motivos de novedad</h3>
                  <p>
                    El técnico selecciona uno cuando un trabajo no puede
                    completarse.
                  </p>
                </div>
              </div>
              <div className="service-config-grid">
                <div className="config-items reason-items">
                  {reasons.map((reason) => (
                    <article
                      className={reason.active === false ? "disabled" : ""}
                      key={reason.id}
                    >
                      <span className="category-symbol warning-symbol">
                        <Icon name="alert" />
                      </span>
                      <span>
                        <strong>{reason.name}</strong>
                        <small>
                          {reason.active === false
                            ? "No disponible para técnicos"
                            : "Disponible para técnicos"}
                        </small>
                      </span>
                      <button
                        className={`switch ${reason.active === false ? "" : "on"}`}
                        onClick={() => toggleReason(reason)}
                      >
                        <i />
                      </button>
                    </article>
                  ))}
                </div>
                <form className="config-form" onSubmit={addReason}>
                  <span className="eyebrow">Nueva opción</span>
                  <h3>Agregar motivo</h3>
                  <Field
                    label="Nombre del motivo"
                    name="name"
                    required
                    placeholder="Ej. Cliente solicitó reprogramar"
                  />
                  {error && <p className="form-error">{error}</p>}
                  <button className="primary-button">Guardar motivo</button>
                </form>
              </div>
            </>
          )}
          {tab === "company" && (
            <>
              <div className="settings-section-head">
                <div>
                  <h3>Datos generales</h3>
                  <p>
                    Información operativa visible en documentos y comunicaciones
                    futuras.
                  </p>
                </div>
              </div>
              <form className="company-form" onSubmit={saveCompany}>
                <div className="company-form-block">
                  <h4>Identidad</h4>
                  <div className="form-grid">
                    <Field
                      label="Nombre de la empresa"
                      name="companyName"
                      required
                      defaultValue={company.companyName}
                    />
                    <Field
                      label="Prefijo de tickets"
                      name="ticketPrefix"
                      required
                      defaultValue={company.ticketPrefix}
                    />
                  </div>
                </div>
                <div className="company-form-block">
                  <h4>Canales de atención</h4>
                  <div className="form-grid">
                    <Field
                      label="Teléfono de soporte"
                      name="supportPhone"
                      type="tel"
                      defaultValue={company.supportPhone}
                    />
                    <Field
                      label="Correo de soporte"
                      name="supportEmail"
                      type="email"
                      defaultValue={company.supportEmail}
                    />
                  </div>
                </div>
                <div className="company-form-block">
                  <h4>Operación</h4>
                  <div className="form-grid">
                    <label className="field">
                      <span>Zona horaria</span>
                      <select name="timezone" defaultValue={company.timezone}>
                        <option value="America/Bogota">
                          Colombia · Bogotá
                        </option>
                        <option value="America/Caracas">
                          Venezuela · Caracas
                        </option>
                        <option value="America/Lima">Perú · Lima</option>
                      </select>
                    </label>
                    <Field
                      label="Horario de atención"
                      name="businessHours"
                      defaultValue={company.businessHours}
                      placeholder="Lun–Sáb, 8:00 a 18:00"
                    />
                  </div>
                </div>
                {error && <p className="form-error">{error}</p>}
                <div className="company-save">
                  <button className="primary-button">Guardar cambios</button>
                </div>
              </form>
            </>
          )}
          {tab === "integrations" && (
            <>
              <div className="settings-section-head">
                <div>
                  <h3>Integraciones externas</h3>
                  <p>
                    Conecta Sky Ticket con WispHub para reconocer clientes por
                    su IP.
                  </p>
                </div>
                <span
                  className={
                    wisphub.enabled && wisphub.apiKeyConfigured
                      ? "integration-online"
                      : ""
                  }
                >
                  {wisphub.enabled && wisphub.apiKeyConfigured
                    ? "Conectado"
                    : "Inactivo"}
                </span>
              </div>
              <form className="integration-card" onSubmit={saveWispHub}>
                <div className="integration-logo">W</div>
                <div className="integration-title">
                  <div>
                    <h4>WispHub</h4>
                    <p>
                      Consulta clientes, ubicación, plan y datos de contacto
                      desde tickets.
                    </p>
                  </div>
                  <label className="integration-switch">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={wisphub.enabled}
                    />
                    <span />
                  </label>
                </div>
                <div className="integration-fields">
                  <Field
                    label="URL base de la API"
                    name="baseUrl"
                    type="url"
                    required
                    defaultValue={wisphub.baseUrl}
                  />
                  <label className="field">
                    <span>API key</span>
                    <input
                      name="apiKey"
                      type="password"
                      placeholder={
                        wisphub.apiKeyConfigured
                          ? "••••••••••••••••  Clave configurada"
                          : "Api-Key de WispHub"
                      }
                      autoComplete="new-password"
                    />
                  </label>
                </div>
                <div className="secret-warning">
                  <Icon name="lock" />
                  <p>
                    La clave se cifra antes de guardarse. Nunca se envía al
                    navegador, asistentes, técnicos ni agentes externos.
                  </p>
                </div>
                {connectionMessage && (
                  <p className="connection-success">
                    <Icon name="check" />
                    {connectionMessage}
                  </p>
                )}
                {error && <p className="form-error">{error}</p>}
                <div className="integration-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!wisphub.apiKeyConfigured}
                    onClick={testWispHub}
                  >
                    Probar conexión
                  </button>
                  <button className="primary-button">
                    Guardar integración
                  </button>
                </div>
              </form>
              <div className="integration-help">
                <h4>Permiso requerido en WispHub</h4>
                <p>
                  La API key debe permitir consultar{" "}
                  <strong>clientes e instalaciones</strong>. Sky Ticket usa
                  únicamente lectura sobre <code>/api/clientes/</code> y{" "}
                  <code>/api/instalaciones/</code>.
                </p>
              </div>
            </>
          )}
          {tab === "security" && (
            <>
              <div className="security-password-card">
                <div className="security-password-icon"><Icon name="lock" /></div>
                <div className="security-password-copy">
                  <span className="eyebrow">Tu cuenta</span>
                  <h3>Contraseña</h3>
                  <p>Actualiza tu clave de acceso de forma segura.</p>
                </div>
                <button className="primary-button" onClick={onPassword}>
                  <Icon name="lock" /> Cambiar mi contraseña
                </button>
              </div>
              <div className="settings-section-head">
                <div>
                  <h3>Permisos por rol</h3>
                  <p>
                    Consulta las acciones disponibles para cada tipo de usuario.
                  </p>
                </div>
              </div>
              <div className="permission-table">
                <div className="permission-head">
                  <span>Función</span>
                  <span>Administrador</span>
                  <span>Asistente</span>
                  <span>Técnico</span>
                </div>
                {[
                  ["Ver todos los tickets", true, true, false],
                  ["Crear clientes y tickets", true, true, false],
                  ["Asignar técnicos", true, true, false],
                  ["Cambiar estados", true, true, true],
                  ["Crear empleados", true, false, false],
                  ["Activar o bloquear accesos", true, false, false],
                  ["Editar categorías y motivos", true, false, false],
                  ["Configurar empresa", true, false, false],
                  ["Crear credenciales de agentes", true, false, false],
                ].map(([label, admin, assistant, technician]) => (
                  <div key={String(label)}>
                    <strong>{label}</strong>
                    <Permission allowed={Boolean(admin)} />
                    <Permission allowed={Boolean(assistant)} />
                    <Permission allowed={Boolean(technician)} />
                  </div>
                ))}
              </div>
              <div className="security-note">
                <Icon name="lock" />
                <div>
                  <strong>
                    Los asistentes no configuran información sensible
                  </strong>
                  <p>
                    No pueden administrar empleados, roles, credenciales de
                    agentes, categorías, motivos ni datos generales. Solo operan
                    clientes y tickets.
                  </p>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      {editing && (
        <div className="modal-backdrop">
          <form className="modal edit-category-modal" onSubmit={saveCategory}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Editar servicio</span>
                <h2>{editing.name}</h2>
                <p>
                  El código interno no puede cambiar porque ya identifica
                  tickets.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEditing(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="employee-form-body">
              <Field
                label="Nombre visible"
                name="name"
                required
                defaultValue={editing.name}
              />
              <Field
                label="Campos del formulario"
                name="fields"
                defaultValue={(editing.fields || []).join(", ")}
              />
              <p className="form-help">
                Eliminar un campo no borra los valores guardados en tickets
                anteriores.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
              <button className="primary-button">Guardar cambios</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Permission({ allowed }: { allowed: boolean }) {
  return (
    <span className={`permission ${allowed ? "allowed" : ""}`}>
      <Icon name={allowed ? "check" : "close"} />
      {allowed ? "Sí" : "No"}
    </span>
  );
}

function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      await onLogin();
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="logo light">
          <span className="logo-mark">S</span>
          <div>
            <strong>Sky</strong>
            <small>Soluciones</small>
          </div>
        </div>
        <div>
          <span>Operación simple. Servicio memorable.</span>
          <h1>Conecta a tu equipo con lo que importa.</h1>
          <p>
            Tickets claros, técnicos coordinados y clientes mejor atendidos.
          </p>
        </div>
        <div className="story-orbit">
          <span />
          <span />
          <span />
        </div>
      </section>
      <section className="login-form-wrap">
        <form onSubmit={submit}>
          <span className="welcome-pill">Bienvenido de nuevo</span>
          <h2>Inicia tu jornada</h2>
          <p>Ingresa con tu cuenta de Sky Soluciones.</p>
          <Field
            label="Correo electrónico"
            name="email"
            type="email"
            required
          />
          <Field label="Contraseña" name="password" type="password" required />
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button login-button" disabled={busy}>
            {busy ? "Ingresando..." : "Ingresar"}
            <Icon name="arrow" />
          </button>
          <small className="secure-note">
            <Icon name="lock" />
            Tu acceso está protegido
          </small>
        </form>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  readOnly,
  wide,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  wide?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>
        {label}
        {required && " *"}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        readOnly={readOnly}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </label>
  );
}
function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}
function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`status-badge ${status.toLowerCase()}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
function StatusDot({ status }: { status: TicketStatus }) {
  return (
    <span className={`status-dot ${status.toLowerCase()}`}>
      <Icon name={status === "PENDING" ? "alert" : "ticket"} />
    </span>
  );
}
function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar">
      {name
        .split(" ")
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon name={icon} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function TicketBlank({ count }: { count: number }) {
  return (
    <section className="ticket-blank">
      <div>
        <span>
          <Icon name="ticket" />
        </span>
        <h2>Selecciona un ticket</h2>
        <p>
          Consulta sus datos, asigna un técnico y acompaña el trabajo hasta
          resolverlo.
        </p>
        <small>{count} tickets en esta vista</small>
      </div>
    </section>
  );
}
function Toast({ message, close }: { message: string; close: () => void }) {
  return (
    <div className="toast">
      <Icon name="alert" />
      <span>{message}</span>
      <button onClick={close}>
        <Icon name="close" />
      </button>
    </div>
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    ticket: (
      <>
        <path d="M4 5h16v4a2 2 0 0 0 0 4v6H4v-6a2 2 0 0 0 0-4V5Z" />
        <path d="M9 9h6M9 13h4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    logout: (
      <>
        <path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
        <path d="m18 15 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z" />
      </>
    ),
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    tool: (
      <>
        <path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L20 16.4 16.4 20l-7.7-7.7" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2.8 20h18.4L12 3Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 6 6 6-6 6" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    pin: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    phone: (
      <path d="M8 3H5a2 2 0 0 0-2 2c0 8.8 7.2 16 16 16a2 2 0 0 0 2-2v-3l-4-1-1.5 2a13 13 0 0 1-8.5-8.5L9 7 8 3Z" />
    ),
    clipboard: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V2h6v2M9 10h6M9 14h6" />
      </>
    ),
    message: (
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
    ),
    send: <path d="m3 11 18-8-8 18-2-8-8-2Zm8 2 4-4" />,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    back: <path d="m15 18-6-6 6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    wifi: (
      <>
        <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
        <circle cx="12" cy="20" r=".5" />
      </>
    ),
    truck: (
      <>
        <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
        <circle cx="7" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </>
    ),
    tv: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="m8 2 4 4 4-4" />
      </>
    ),
    wrench: (
      <path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L3 18l3 3 9.3-9.3a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3Z" />
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name] || paths.ticket}
    </svg>
  );
}

function roleName(role: Role) {
  return {
    ADMIN: "Administrador",
    ASSISTANT: "Asistente",
    TEAM_LEADER: "Líder de equipo",
    TECHNICIAN: "Técnico",
  }[role];
}
function greeting() {
  const hour = new Date().getHours();
  return hour < 12
    ? "Buenos días"
    : hour < 18
      ? "Buenas tardes"
      : "Buenas noches";
}
function humanize(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function categoryIcon(code: string) {
  if (code.includes("iptv")) return "tv";
  if (code.includes("transfer")) return "truck";
  if (code.includes("failure")) return "wrench";
  if (code.includes("upgrade")) return "pulse";
  return "wifi";
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
function localDateValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function todayValue() {
  return localDateValue(new Date());
}
function formatPlanningDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "long" }).format(new Date(`${value}T12:00:00`));
}
function formatTicketForClipboard(ticket: Ticket) {
  const addressParts = (ticket.customer.address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const generatedStart = `${ticket.category.name} - `;
  const generatedEnd = ` - ${ticket.customer.name}`;
  const titlePopulation =
    ticket.title.startsWith(generatedStart) && ticket.title.endsWith(generatedEnd)
      ? ticket.title.slice(generatedStart.length, -generatedEnd.length).trim()
      : "";
  const population = titlePopulation || addressParts.at(-1) || "SIN POBLACIÓN";
  const address = titlePopulation
    ? addressParts.slice(0, -1).join(", ") || ticket.customer.address
    : addressParts.length > 1
      ? addressParts.slice(0, -1).join(", ")
      : ticket.customer.address;
  const fieldLabels: Record<string, string> = {
    ipCliente: "IP",
    plan: "Plan",
    valorInstalacion: "Valor",
    indicaciones: "Indicaciones",
    motivo: "Motivo",
    equipos: "Equipos",
    direccionActual: "Desde",
    direccionNueva: "Hacia",
    planTv: "Plan TV",
    decodificadores: "Decodificadores",
  };
  const fieldsByCategory: Record<string, string[]> = {
    installation: ["plan", "valorInstalacion", "indicaciones"],
    failure: ["ipCliente"],
    upgrade: ["ipCliente"],
    removal: ["ipCliente", "motivo", "equipos"],
    transfer: ["ipCliente", "direccionActual", "direccionNueva"],
    iptv: ["ipCliente", "planTv", "decodificadores", "valorInstalacion"],
  };
  const descriptionLabels: Record<string, string> = {
    failure: "Falla",
    upgrade: "Solicitud",
  };
  const lines = [
    population.toUpperCase(),
    "",
    `TK-${ticket.number} · ${ticket.category.name.toUpperCase()} · ${statusLabels[ticket.status].toUpperCase()}`,
    `Cliente: ${ticket.customer.name}`,
  ];
  if (ticket.customer.phone) lines.push(`Teléfono: ${ticket.customer.phone}`);
  if (address) lines.push(`Dirección: ${address}`);
  for (const key of fieldsByCategory[ticket.category.code] ?? ticket.category.fields) {
    const value = ticket.customFields?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      lines.push(`${fieldLabels[key] ?? humanize(key)}: ${String(value).trim()}`);
    }
  }
  const descriptionLabel = descriptionLabels[ticket.category.code];
  if (descriptionLabel && ticket.description?.trim()) {
    lines.push(`${descriptionLabel}: ${ticket.description.trim()}`);
  }
  if (ticket.status === "PENDING") {
    if (ticket.pendingReason?.name) lines.push(`Motivo pendiente: ${ticket.pendingReason.name}`);
    if (ticket.pendingNote) lines.push(`Observación: ${ticket.pendingNote}`);
  }
  return lines.join("\n");
}
function formatPendingReport(tickets: Ticket[]) {
  const knownCategories = [
    { code: "installation", icon: "🏠", label: "Instalaciones" },
    { code: "failure", icon: "🚨", label: "Revisiones / Fallas" },
    { code: "upgrade", icon: "📶", label: "Mejoras de servicio" },
    { code: "removal", icon: "🔄", label: "Retiros" },
    { code: "transfer", icon: "🔄📶", label: "Traslados" },
    { code: "iptv", icon: "📡📺", label: "Instalaciones IPTV" },
  ];
  const configured = new Set(knownCategories.map(({ code }) => code));
  const categories = [
    ...knownCategories,
    ...Array.from(new Map(
      tickets
        .filter((ticket) => !configured.has(ticket.category.code))
        .map((ticket) => [ticket.category.code, { code: ticket.category.code, icon: "🎫", label: ticket.category.name }]),
    ).values()),
  ];
  const groups = categories.map((category) => ({
    ...category,
    tickets: tickets.filter((ticket) => ticket.category.code === category.code),
  }));
  const lines = [
    "*PENDIENTES DEL DÍA*",
    "",
    "*📊 Resumen general*",
    ...groups.map(({ icon, label, tickets: items }) => `${icon} ${label}: ${items.length}`),
  ];
  for (const group of groups) {
    lines.push("", `*${group.icon} ${group.label} (${group.tickets.length})*`);
    if (!group.tickets.length) {
      lines.push("• Sin pendientes.");
      continue;
    }
    if (["installation", "removal", "transfer", "iptv"].includes(group.code)) {
      const byPopulation = new Map<string, { population: string; count: number }>();
      for (const ticket of group.tickets) {
        const population = ticketPopulation(ticket) || "Sin población";
        const key = population.toLocaleLowerCase("es-CO");
        const current = byPopulation.get(key);
        byPopulation.set(key, { population: current?.population ?? population, count: (current?.count ?? 0) + 1 });
      }
      const names: Record<string, [string, string]> = {
        installation: ["instalación", "instalaciones"],
        removal: ["retiro", "retiros"],
        transfer: ["traslado", "traslados"],
        iptv: ["instalación IPTV", "instalaciones IPTV"],
      };
      for (const { population, count } of byPopulation.values()) {
        lines.push(`• ${count} ${names[group.code][count === 1 ? 0 : 1]} — ${population}.`);
      }
    } else {
      for (const ticket of group.tickets) {
        const population = ticketPopulation(ticket) || "Sin población";
        const generatedTitle = `${ticket.category.name} - ${population} - ${ticket.customer.name}`;
        const title = ticket.title.trim();
        const detail = title !== generatedTitle ? title : ticket.description?.trim() || ticket.pendingNote?.trim() || "Sin detalle";
        lines.push(`• ${population} — ${detail}.`);
      }
    }
    lines.push("", `Total detallado: ${group.tickets.length} ${group.label.toLowerCase()}.`);
  }
  lines.push("", `*TOTAL PENDIENTE: ${tickets.length}*`);
  return lines.join("\n");
}
function externalHref(value: unknown) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return null;
}
function mapHref(ticket: Ticket) {
  const raw = typeof ticket.customFields?.mapa === "string" ? ticket.customFields.mapa.trim() : "";
  const target = raw || ticket.customer.address?.trim() || "";
  if (!target) return null;
  return externalHref(target) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`;
}
function canChangeTicketStatus(user: User, ticket: Ticket) {
  return user.role !== "TEAM_LEADER" && !(user.role === "TECHNICIAN" && ticket.status === "RESOLVED");
}
function ticketPopulation(ticket: Ticket) {
  const generatedStart = `${ticket.category.name} - `;
  const generatedEnd = ` - ${ticket.customer.name}`;
  if (ticket.title.startsWith(generatedStart) && ticket.title.endsWith(generatedEnd)) {
    return ticket.title.slice(generatedStart.length, -generatedEnd.length).trim();
  }
  return (ticket.customer.address || "").split(",").at(-1)?.trim() || "";
}
function parseFields(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function setFormValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name) as
    HTMLInputElement | HTMLTextAreaElement | null;
  if (field) {
    const setter = Object.getOwnPropertyDescriptor(
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
