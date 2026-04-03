// Ticket System Application Logic

// Data Management
const STORAGE_KEY = 'bugTrackerTickets';

// Generate a random ticket ID like TKT-4829
function generateId() {
    return 'TKT-' + Math.floor(1000 + Math.random() * 9000);
}

// Load tickets from local storage
function loadTickets() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

// Save tickets to local storage
function saveTickets(tickets) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

// Global state
let allTickets = loadTickets();

// DOM Elements
const grid = document.getElementById('ticketGrid');
const emptyState = document.getElementById('emptyState');
const modal = document.getElementById('ticketModal');
const ticketForm = document.getElementById('ticketForm');

// Toolbar
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const priorityFilter = document.getElementById('priorityFilter');
const openCountEl = document.getElementById('openCount');
const resolvedCountEl = document.getElementById('resolvedCount');

// Buttons
const addTicketBtn = document.getElementById('addTicketBtn');
const emptyAddBtn = document.getElementById('emptyAddBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelBtn');

// Initialize App
function init() {
    renderTickets();
    updateStats();
}

// Event Listeners for UI
addTicketBtn.addEventListener('click', openModal);
emptyAddBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);

// Close modal on click outside
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Filters
searchInput.addEventListener('input', renderTickets);
statusFilter.addEventListener('change', renderTickets);
priorityFilter.addEventListener('change', renderTickets);

function openModal() {
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('active'), 10);
    setTimeout(() => document.getElementById('ticketTitle').focus(), 300);
}

function closeModal() {
    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.add('hidden');
        ticketForm.reset();
    }, 300);
}

// Form Submission
ticketForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const title = document.getElementById('ticketTitle').value.trim();
    const priority = document.getElementById('ticketPriority').value;
    const reporter = document.getElementById('ticketReporter').value.trim();
    const description = document.getElementById('ticketDescription').value.trim();
    
    if(!title || !reporter || !description) return;
    
    const newTicket = {
        id: generateId(),
        title: title,
        priority: priority,
        reporter: reporter,
        description: description,
        status: 'Open',
        createdAt: new Date().toISOString()
    };
    
    allTickets.unshift(newTicket); // Add to beginning
    saveTickets(allTickets);
    
    closeModal();
    renderTickets();
    updateStats();
});

function toggleStatus(id) {
    const ticketIdx = allTickets.findIndex(t => t.id === id);
    if(ticketIdx > -1) {
        if(allTickets[ticketIdx].status === 'Open') {
            allTickets[ticketIdx].status = 'Resolved';
        } else {
            allTickets[ticketIdx].status = 'Open';
        }
        saveTickets(allTickets);
        renderTickets();
        updateStats();
    }
}

function deleteTicket(id) {
    if(confirm(`Are you sure you want to delete ticket ${id}?`)) {
        allTickets = allTickets.filter(t => t.id !== id);
        saveTickets(allTickets);
        renderTickets();
        updateStats();
    }
}

// Render Logic
function updateStats() {
    const openCount = allTickets.filter(t => t.status === 'Open').length;
    const resolvedCount = allTickets.filter(t => t.status === 'Resolved').length;
    
    openCountEl.textContent = `Open: ${openCount}`;
    resolvedCountEl.textContent = `Resolved: ${resolvedCount}`;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function renderTickets() {
    const query = searchInput.value.toLowerCase();
    const statusVal = statusFilter.value;
    const priorityVal = priorityFilter.value;
    
    // Filter
    const filtered = allTickets.filter(ticket => {
        const matchesSearch = ticket.title.toLowerCase().includes(query) || ticket.id.toLowerCase().includes(query);
        const matchesStatus = statusVal === 'All' ? true : ticket.status === statusVal;
        const matchesPriority = priorityVal === 'All' ? true : ticket.priority === priorityVal;
        
        return matchesSearch && matchesStatus && matchesPriority;
    });
    
    grid.innerHTML = '';
    
    if (filtered.length === 0) {
        if(allTickets.length === 0 && !query && statusVal === 'All' && priorityVal === 'All') {
            // Completely empty
            emptyState.classList.remove('hidden');
            emptyState.querySelector('h3').textContent = 'All clear!';
            emptyState.querySelector('p').textContent = 'No tickets found. You are all caught up!';
            emptyAddBtn.classList.remove('hidden');
        } else {
            // Search/filter no results
            emptyState.classList.remove('hidden');
            emptyState.querySelector('h3').textContent = 'No Matches';
            emptyState.querySelector('p').textContent = 'No tickets match your current filters.';
            emptyAddBtn.classList.add('hidden');
        }
    } else {
        emptyState.classList.add('hidden');
        
        filtered.forEach(ticket => {
            const card = document.createElement('div');
            card.className = 'card';
            
            // Format reporter avatar initials
            const initials = ticket.reporter.substring(0, 2).toUpperCase();
            
            // Build actions based on status
            let actionBtnHTML = '';
            if(ticket.status === 'Open') {
                actionBtnHTML = `<button class="action-btn resolve" onclick="toggleStatus('${ticket.id}')">Resolve</button>`;
            } else {
                actionBtnHTML = `<button class="action-btn" onclick="toggleStatus('${ticket.id}')">Reopen</button>`;
            }
            
            card.innerHTML = `
                <div class="card-header">
                    <div>
                        <span class="card-id">${ticket.id}</span>
                        <h3 class="card-title">${escapeHTML(ticket.title)}</h3>
                    </div>
                </div>
                
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <span class="badge s-${ticket.status.toLowerCase()}">${ticket.status}</span>
                    <span class="badge p-${ticket.priority.toLowerCase()}">${ticket.priority}</span>
                </div>
                
                <div class="card-desc">
                    ${escapeHTML(ticket.description).replace(/\n/g, '<br>')}
                </div>
                
                <div class="card-footer">
                    <div class="reporter">
                        <div class="reporter-avatar">${initials}</div>
                        ${escapeHTML(ticket.reporter)}
                    </div>
                    <div class="card-actions">
                        ${actionBtnHTML}
                        <button class="action-btn delete" onclick="deleteTicket('${ticket.id}')" aria-label="Delete">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            `;
            
            grid.appendChild(card);
        });
    }
}

// Start
init();
