// ============================================================
// BugTracker — Multi-User Ticket System (Supabase + Magic Link)
// ============================================================

// ---------- Supabase client ----------
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- DOM refs (auth) ----------
const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');
const authSuccess = document.getElementById('authSuccess');
const userEmailEl = document.getElementById('userEmail');
const signOutBtn = document.getElementById('signOutBtn');

// ---------- DOM refs (app) ----------
const grid = document.getElementById('ticketGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const modal = document.getElementById('ticketModal');
const modalTitle = document.getElementById('modalTitle');
const ticketForm = document.getElementById('ticketForm');
const editingTicketId = document.getElementById('editingTicketId');
const titleInput = document.getElementById('ticketTitle');
const priorityInput = document.getElementById('ticketPriority');
const reporterInput = document.getElementById('ticketReporter');
const assignedToInput = document.getElementById('ticketAssignedTo');
const assignedByInput = document.getElementById('ticketAssignedBy');
const descriptionInput = document.getElementById('ticketDescription');
const saveTicketBtn = document.getElementById('saveTicketBtn');

const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const priorityFilter = document.getElementById('priorityFilter');
const assignedToFilter = document.getElementById('assignedToFilter');
const assignedByFilter = document.getElementById('assignedByFilter');
const sortBy = document.getElementById('sortBy');
const openCountEl = document.getElementById('openCount');
const resolvedCountEl = document.getElementById('resolvedCount');

const addTicketBtn = document.getElementById('addTicketBtn');
const emptyAddBtn = document.getElementById('emptyAddBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelBtn');

const confirmModal = document.getElementById('confirmModal');
const confirmText = document.getElementById('confirmText');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

const toast = document.getElementById('toast');

// ---------- State ----------
let allTickets = [];
let pendingDeleteId = null;

// ---------- Team Members (hardcoded list) ----------
const TEAM_MEMBERS = [
    'James Brady',
    'Nick Gillis',
    'Evan Walters',
    'Glenn Lundy',
    'Hannah Gross',
    'Brandon Randolph',
    'Jessica Bailey',
    'Sam Cox'
];

function populateTeamDropdowns() {
    // "Assigned To" form dropdown
    for (const name of TEAM_MEMBERS) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        assignedToInput.appendChild(opt);
    }
    // Filter: "All Assignees"
    for (const name of TEAM_MEMBERS) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        assignedToFilter.appendChild(opt);
    }
    // Filter: "All Assigners"
    for (const name of TEAM_MEMBERS) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        assignedByFilter.appendChild(opt);
    }
}
populateTeamDropdowns();

// ============================================================
// AUTH — MAGIC LINK
// ============================================================

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthMessages();
    const email = authEmail.value.trim().toLowerCase();
    if (!email) return;

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Sending...';

    try {
        // shouldCreateUser: false → only PRE-APPROVED users (added in Supabase) can sign in.
        // Unknown emails get an "Email not allowed" type error.
        const { error } = await db.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: false,
                emailRedirectTo: window.location.origin + window.location.pathname
            }
        });
        if (error) throw error;
        showAuthSuccess('✓ Check your email — click the magic link to sign in. (Check spam if you don\'t see it.)');
        authSubmitBtn.textContent = 'Magic Link Sent';
    } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('signups not allowed') || msg.includes('user not allowed') || msg.includes('not found')) {
            showAuthError('That email is not on the access list. Ask your admin to add you.');
        } else if (msg.includes('rate')) {
            showAuthError('Too many requests. Please wait a minute and try again.');
        } else {
            showAuthError(err.message || 'Something went wrong. Please try again.');
        }
        authSubmitBtn.textContent = 'Send Magic Link';
        authSubmitBtn.disabled = false;
    }
});

signOutBtn.addEventListener('click', async () => {
    await db.auth.signOut();
});

function showAuthError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
    authSuccess.classList.add('hidden');
}
function showAuthSuccess(msg) {
    authSuccess.textContent = msg;
    authSuccess.classList.remove('hidden');
    authError.classList.add('hidden');
}
function hideAuthMessages() {
    authError.classList.add('hidden');
    authSuccess.classList.add('hidden');
}

// Listen for auth state changes (login, logout, session restore)
db.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
        showApp(session.user);
    } else {
        showLogin();
    }
});

function showApp(user) {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    userEmailEl.textContent = user.email;
    if (!reporterInput.value) {
        reporterInput.value = user.email.split('@')[0];
    }
    loadTickets();
    subscribeToChanges();
}

function showLogin() {
    appScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    authEmail.value = '';
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = 'Send Magic Link';
    hideAuthMessages();
    allTickets = [];
    if (realtimeChannel) {
        db.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
}

// ============================================================
// TICKETS — DATABASE OPERATIONS
// ============================================================

async function loadTickets() {
    loadingState.classList.remove('hidden');
    grid.classList.add('hidden');
    emptyState.classList.add('hidden');

    const { data, error } = await db
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

    loadingState.classList.add('hidden');
    grid.classList.remove('hidden');

    if (error) {
        showToast('Could not load tickets: ' + error.message, 'error');
        return;
    }
    allTickets = data || [];
    renderTickets();
    updateStats();
}

async function createTicket(ticket) {
    const { data: { user } } = await db.auth.getUser();
    const payload = {
        ticket_code: generateCode(),
        title: ticket.title,
        priority: ticket.priority,
        reporter: ticket.reporter,
        description: ticket.description,
        status: 'Open',
        created_by: user.id,
        assigned_to: ticket.assigned_to || null,
        assigned_by: ticket.assigned_to ? ticket.assigned_by : null,
        assigned_at: ticket.assigned_to ? new Date().toISOString() : null
    };
    const { data, error } = await db.from('tickets').insert(payload).select().single();
    if (error) { showToast('Could not save: ' + error.message, 'error'); return null; }
    return data;
}

async function updateTicket(id, updates) {
    const { data, error } = await db.from('tickets').update(updates).eq('id', id).select().single();
    if (error) { showToast('Could not update: ' + error.message, 'error'); return null; }
    return data;
}

async function deleteTicketDB(id) {
    const { error } = await db.from('tickets').delete().eq('id', id);
    if (error) { showToast('Could not delete: ' + error.message, 'error'); return false; }
    return true;
}

function generateCode() {
    return 'TKT-' + crypto.randomUUID().split('-')[0].toUpperCase();
}

// ============================================================
// REAL-TIME SYNC
// ============================================================

let realtimeChannel = null;

function subscribeToChanges() {
    if (realtimeChannel) db.removeChannel(realtimeChannel);
    realtimeChannel = db
        .channel('tickets-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
            loadTickets();
        })
        .subscribe();
}

// ============================================================
// MODAL / FORM
// ============================================================

addTicketBtn.addEventListener('click', () => openModal());
emptyAddBtn.addEventListener('click', () => openModal());
closeModalBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modal.classList.contains('hidden')) closeModal();
    if (!confirmModal.classList.contains('hidden')) closeConfirm();
});

function openModal(ticket = null) {
    // "Assigned By" is always whoever is logged in (best guess: their team name from email)
    const currentAssigner = guessCurrentUserName();

    if (ticket) {
        modalTitle.textContent = 'Edit Ticket';
        saveTicketBtn.textContent = 'Save Changes';
        editingTicketId.value = ticket.id;
        titleInput.value = ticket.title;
        priorityInput.value = ticket.priority;
        reporterInput.value = ticket.reporter;
        assignedToInput.value = ticket.assigned_to || '';
        // Preserve original assigner if already set; otherwise use current user
        assignedByInput.value = ticket.assigned_by || (ticket.assigned_to ? currentAssigner : '');
        descriptionInput.value = ticket.description;
    } else {
        modalTitle.textContent = 'Create New Ticket';
        saveTicketBtn.textContent = 'Submit Ticket';
        editingTicketId.value = '';
        ticketForm.reset();
        assignedByInput.value = currentAssigner;
    }
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('active'));
    setTimeout(() => titleInput.focus(), 200);
}

function guessCurrentUserName() {
    // Try to match the logged-in user's email to a team member name.
    // Falls back to the email's local-part (e.g. 'james' from 'james@x.com').
    const email = (userEmailEl.textContent || '').toLowerCase();
    if (!email) return '';
    for (const name of TEAM_MEMBERS) {
        const first = name.split(' ')[0].toLowerCase();
        const last  = name.split(' ').slice(-1)[0].toLowerCase();
        if (email.startsWith(first + '@') || email.startsWith(first + '.') ||
            email.startsWith(first + last) || email.startsWith(last + first) ||
            email.includes(first + '.' + last) || email.includes(last + '.' + first)) {
            return name;
        }
    }
    return email.split('@')[0];
}

function closeModal() {
    modal.classList.remove('active');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

ticketForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    const priority = priorityInput.value;
    const reporter = reporterInput.value.trim();
    const description = descriptionInput.value.trim();
    const assigned_to = assignedToInput.value.trim();
    const assigned_by = assignedByInput.value.trim();
    if (!title || !reporter || !description) return;

    saveTicketBtn.disabled = true;
    const originalText = saveTicketBtn.textContent;
    saveTicketBtn.textContent = 'Saving...';

    if (editingTicketId.value) {
        // Find the existing ticket to know if assignment is changing
        const existing = allTickets.find(t => t.id === editingTicketId.value);
        const wasAssignedTo = existing?.assigned_to || '';
        const updates = { title, priority, reporter, description, assigned_to: assigned_to || null };

        if (assigned_to && assigned_to !== wasAssignedTo) {
            // New assignment (or reassignment) — stamp the assigner and date
            updates.assigned_by = assigned_by || guessCurrentUserName();
            updates.assigned_at = new Date().toISOString();
        } else if (!assigned_to) {
            // Cleared assignment
            updates.assigned_by = null;
            updates.assigned_at = null;
        }
        // (else: same assignee — leave assigned_by/assigned_at unchanged)

        const updated = await updateTicket(editingTicketId.value, updates);
        if (updated) showToast('Ticket updated');
    } else {
        const created = await createTicket({ title, priority, reporter, description, assigned_to, assigned_by });
        if (created) showToast('Ticket created');
    }

    saveTicketBtn.disabled = false;
    saveTicketBtn.textContent = originalText;
    closeModal();
    loadTickets();
});

// ============================================================
// CONFIRM DELETE MODAL
// ============================================================

function openConfirm(ticket) {
    pendingDeleteId = ticket.id;
    confirmText.textContent = `Delete ticket "${ticket.ticket_code}: ${ticket.title}"? This cannot be undone.`;
    confirmModal.classList.remove('hidden');
    requestAnimationFrame(() => confirmModal.classList.add('active'));
}

function closeConfirm() {
    confirmModal.classList.remove('active');
    setTimeout(() => confirmModal.classList.add('hidden'), 300);
    pendingDeleteId = null;
}

confirmCancelBtn.addEventListener('click', closeConfirm);
confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirm();
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const ok = await deleteTicketDB(pendingDeleteId);
    closeConfirm();
    if (ok) {
        showToast('Ticket deleted');
        loadTickets();
    }
});

// ============================================================
// RENDER
// ============================================================

let searchTimer;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderTickets, 150);
});
statusFilter.addEventListener('change', renderTickets);
priorityFilter.addEventListener('change', renderTickets);
assignedToFilter.addEventListener('change', renderTickets);
assignedByFilter.addEventListener('change', renderTickets);
sortBy.addEventListener('change', renderTickets);

// ---------- Sorting ----------
const PRIORITY_RANK = { High: 3, Medium: 2, Low: 1 };
const ts = (v) => { const d = new Date(v); return isNaN(d) ? 0 : d.getTime(); };
const SORTERS = {
    newest:   (a, b) => ts(b.created_at) - ts(a.created_at),
    oldest:   (a, b) => ts(a.created_at) - ts(b.created_at),
    updated:  (a, b) => ts(b.updated_at) - ts(a.updated_at),
    priority: (a, b) => (PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]) || (ts(b.created_at) - ts(a.created_at)),
};

function updateStats() {
    const open = allTickets.filter(t => t.status === 'Open').length;
    const resolved = allTickets.filter(t => t.status === 'Resolved').length;
    openCountEl.textContent = `Open: ${open}`;
    resolvedCountEl.textContent = `Resolved: ${resolved}`;
}

function escapeHTML(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}

function renderTickets() {
    const query = searchInput.value.toLowerCase();
    const statusVal = statusFilter.value;
    const priorityVal = priorityFilter.value;
    const assignedToVal = assignedToFilter.value;
    const assignedByVal = assignedByFilter.value;

    const filtered = allTickets.filter(t =>
        (t.title.toLowerCase().includes(query) || (t.ticket_code || '').toLowerCase().includes(query)) &&
        (statusVal === 'All' || t.status === statusVal) &&
        (priorityVal === 'All' || t.priority === priorityVal) &&
        (assignedToVal === 'All' ||
            (assignedToVal === '__unassigned__' ? !t.assigned_to : t.assigned_to === assignedToVal)) &&
        (assignedByVal === 'All' || t.assigned_by === assignedByVal)
    );

    filtered.sort(SORTERS[sortBy.value] || SORTERS.newest);

    grid.replaceChildren();

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        const isVirgin = !allTickets.length && !query && statusVal === 'All' && priorityVal === 'All';
        emptyState.querySelector('h3').textContent = isVirgin ? 'All clear!' : 'No Matches';
        emptyState.querySelector('p').textContent = isVirgin
            ? 'No tickets yet. Create your first one!'
            : 'No tickets match your current filters.';
        emptyAddBtn.classList.toggle('hidden', !isVirgin);
        updateStats();
        return;
    }

    emptyState.classList.add('hidden');
    const frag = document.createDocumentFragment();

    for (const t of filtered) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.id = t.id;
        const initials = (t.reporter || '??').substring(0, 2).toUpperCase();
        const assignmentLine = t.assigned_to
            ? `<div class="assignment-line"><strong>Assigned to:</strong> ${escapeHTML(t.assigned_to)}${t.assigned_by ? ` &middot; by ${escapeHTML(t.assigned_by)}` : ''}${t.assigned_at ? ` &middot; ${formatDate(t.assigned_at)}` : ''}</div>`
            : `<div class="assignment-line muted"><strong>Assigned to:</strong> Unassigned</div>`;
        const updatedLine = t.updated_at
            ? `<div class="card-updated">Updated ${escapeHTML(formatDateTime(t.updated_at))}</div>`
            : '';
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <span class="card-id">${escapeHTML(t.ticket_code)}</span>
                    <h3 class="card-title">${escapeHTML(t.title)}</h3>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                <span class="badge s-${t.status.toLowerCase()}">${escapeHTML(t.status)}</span>
                <span class="badge p-${t.priority.toLowerCase()}">${escapeHTML(t.priority)}</span>
                ${t.assigned_to ? `<span class="badge b-assigned">➜ ${escapeHTML(t.assigned_to)}</span>` : ''}
            </div>
            ${assignmentLine}
            <div class="card-desc">${escapeHTML(t.description).replace(/\n/g,'<br>')}</div>
            ${updatedLine}
            <div class="card-footer">
                <div class="reporter">
                    <div class="reporter-avatar">${escapeHTML(initials)}</div>
                    ${escapeHTML(t.reporter)}
                </div>
                <div class="card-actions">
                    <button class="action-btn" data-action="edit" aria-label="Edit ticket">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="action-btn ${t.status === 'Open' ? 'resolve' : ''}" data-action="toggle">
                        ${t.status === 'Open' ? 'Resolve' : 'Reopen'}
                    </button>
                    <button class="action-btn delete" data-action="delete" aria-label="Delete ticket">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
                    </button>
                </div>
            </div>`;
        frag.appendChild(card);
    }
    grid.appendChild(frag);
    updateStats();
}

// Event delegation on grid (one listener for all cards)
grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.closest('.card')?.dataset.id;
    if (!id) return;
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket) return;

    if (btn.dataset.action === 'edit') {
        openModal(ticket);
    } else if (btn.dataset.action === 'toggle') {
        const newStatus = ticket.status === 'Open' ? 'Resolved' : 'Open';
        const updated = await updateTicket(id, { status: newStatus });
        if (updated) {
            showToast(`Marked ${newStatus.toLowerCase()}`);
            loadTickets();
        }
    } else if (btn.dataset.action === 'delete') {
        openConfirm(ticket);
    }
});

// ============================================================
// TOAST
// ============================================================

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Absolute date + time in 12-hour US Eastern time, e.g. "Jun 25, 2026, 3:04 PM EDT".
// timeZoneName: 'short' auto-labels EST/EDT correctly (daylight-saving aware).
function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
        timeZoneName: 'short'
    });
}

let toastTimer;
function showToast(msg, kind = 'success') {
    toast.textContent = msg;
    toast.className = `toast ${kind}`;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

// ============================================================
// INITIAL SESSION CHECK
// ============================================================

(async () => {
    const { data: { session } } = await db.auth.getSession();
    if (session && session.user) {
        showApp(session.user);
    } else {
        showLogin();
    }
})();
