        /* =========================================
           1. STATE & STORAGE MANAGEMENT
           ========================================= */
        const DATA_KEY = 'pace_finance_data';
        const CURRENT_YEAR = 2026;
        const CURRENT_MONTH = 8; // Sept (0-indexed in JS date)
        const CURRENT_DAY = 3; // Given in prompt "Sept 3, 2026"
        const DAYS_IN_MONTH = 30; // Sept has 30 days

        let appData = {
            profile: { name: "User", monthlyIncome: 30000 },
            transactions: [],
            fixedExpenses: [],
            budgets: {
                "Food": 4000,
                "Transport": 2000,
                "Shopping": 3000,
                "Entertainment": 2000
            },
            isInitialized: false
        };

        function loadData() {
            const stored = localStorage.getItem(DATA_KEY);
            if (stored) {
                appData = JSON.parse(stored);
            }
            if(!appData.isInitialized) {
                // First run, empty state
                appData.isInitialized = true;
                saveData();
            }
        }

        function saveData() {
            localStorage.setItem(DATA_KEY, JSON.stringify(appData));
            calculateEngine(); // Recalc everything when data saves
        }

        // Demo Data Loader
        function loadDemoData() {
            appData = {
                profile: { name: "Alex", monthlyIncome: 30000 },
                transactions: [
                    { id: 1, type: 'expense', amount: 120, category: 'Food', date: 1, desc: 'Breakfast', method: 'UPI' },
                    { id: 2, type: 'expense', amount: 340, category: 'Food', date: 3, desc: 'Lunch & Coffee', method: 'UPI' },
                    { id: 3, type: 'expense', amount: 60, category: 'Transport', date: 3, desc: 'Bus', method: 'Cash' },
                    { id: 4, type: 'expense', amount: 800, category: 'Shopping', date: 2, desc: 'Shoes', method: 'Card' },
                ],
                fixedExpenses: [
                    { id: 1, name: 'Rent', amount: 12000, category: 'Housing', dueDate: 1 },
                    { id: 2, name: 'Internet', amount: 799, category: 'Bills', dueDate: 5 },
                    { id: 3, name: 'Netflix', amount: 499, category: 'Subscriptions', dueDate: 15 },
                ],
                budgets: { "Food": 4000, "Transport": 2000, "Shopping": 3000, "Entertainment": 2000 },
                isInitialized: true
            };
            saveData();
            showToast("Demo data loaded.", "success");
        }

        function clearData() {
            if(confirm("Are you sure? This will delete all your PACE data.")) {
                localStorage.removeItem(DATA_KEY);
                location.reload();
            }
        }

        function exportData() {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href",     dataStr);
            downloadAnchorNode.setAttribute("download", "pace_backup.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        }

        /* =========================================
           2. FINANCIAL ENGINE (CALCULATIONS)
           ========================================= */
        let engine = {
            totalIncome: 0,
            totalFixed: 0,
            totalVariable: 0,
            availableForMonth: 0,
            safeDaily: 0,
            paceScore: 100,
            mood: 'peaceful',
            walletBalance: 0,
            spentByDay: {},
            insights: []
        };

        function calculateEngine() {
            const txs = appData.transactions;
            const fixed = appData.fixedExpenses;

            // 1. Incomes & Expenses
            let extraIncome = txs.filter(t => t.type === 'income').reduce((sum, t) => sum + parseInt(t.amount), 0);
            engine.totalIncome = parseInt(appData.profile.monthlyIncome) + extraIncome;
            
            engine.totalFixed = fixed.reduce((sum, f) => sum + parseInt(f.amount), 0);
            
            engine.totalVariable = txs.filter(t => t.type === 'expense').reduce((sum, t) => sum + parseInt(t.amount), 0);
            
            // Map spending per day
            engine.spentByDay = {};
            for(let i=1; i<=DAYS_IN_MONTH; i++) engine.spentByDay[i] = 0;
            txs.filter(t=>t.type==='expense').forEach(t => {
                engine.spentByDay[t.date] += parseInt(t.amount);
            });

            // 2. Pace & Safe to Spend Logic
            engine.availableForMonth = engine.totalIncome - engine.totalFixed;
            let daysRemaining = DAYS_IN_MONTH - CURRENT_DAY + 1; // +1 to include today
            
            if (daysRemaining <= 0) daysRemaining = 1;
            let remainingDiscretionary = engine.availableForMonth - engine.totalVariable;
            
            engine.safeDaily = remainingDiscretionary > 0 ? Math.floor(remainingDiscretionary / daysRemaining) : 0;
            
            engine.walletBalance = engine.totalIncome - engine.totalFixed - engine.totalVariable;

            // 3. PACE Score Calculation (0-100)
            // Ideal spent by today
            let dailyPaceTarget = engine.availableForMonth / DAYS_IN_MONTH;
            let idealSpentByToday = dailyPaceTarget * CURRENT_DAY;
            
            if (engine.walletBalance < 0) {
                engine.paceScore = 0;
            } else {
                let ratio = engine.totalVariable / (idealSpentByToday || 1); 
                // ratio < 1 means spending less than ideal (good)
                // ratio > 1 means spending faster (bad)
                
                if (ratio <= 0.8) engine.paceScore = 100; // Peaceful
                else if (ratio <= 1.0) engine.paceScore = 85; // Healthy
                else if (ratio <= 1.2) engine.paceScore = 60; // Caution
                else if (ratio <= 1.5) engine.paceScore = 40; // Warning
                else if (ratio <= 2.0) engine.paceScore = 20; // Critical
                else engine.paceScore = 10; 
                
                // Fine tune score based on absolute remaining
                if(remainingDiscretionary < 0) engine.paceScore = 5;
            }

            // 4. Mood Mapping
            if (engine.walletBalance < 0) engine.mood = 'overdrawn';
            else if (engine.paceScore <= 20) engine.mood = 'critical';
            else if (engine.paceScore <= 40) engine.mood = 'warning';
            else if (engine.paceScore <= 60) engine.mood = 'caution';
            else if (engine.paceScore <= 85) engine.mood = 'healthy';
            else engine.mood = 'peaceful';

            // Generate Insights
            generateInsights();

            // Trigger UI Updates
            updateUI();
        }

        function generateInsights() {
            engine.insights = [];
            
            // Pace Insight
            if(engine.mood === 'peaceful') engine.insights.push({text: "You're spending well below your safe daily pace.", icon: '✓'});
            else if(engine.mood === 'healthy') engine.insights.push({text: "Your spending pace is healthy and on track.", icon: '✓'});
            else if(engine.mood === 'warning' || engine.mood === 'critical') engine.insights.push({text: "You are spending faster than your current pace allows.", icon: '⚠️'});
            
            // Fixed Expense upcoming
            let upcoming = appData.fixedExpenses.filter(f => f.dueDate >= CURRENT_DAY).sort((a,b)=>a.dueDate - b.dueDate);
            if(upcoming.length > 0) {
                let next = upcoming[0];
                let days = next.dueDate - CURRENT_DAY;
                let dayText = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
                engine.insights.push({text: `${next.name} (₹${next.amount}) is due ${dayText}.`, icon: '📅'});
            }

            // Budget Insight
            let catSpending = {};
            appData.transactions.filter(t=>t.type==='expense').forEach(t=>{
                catSpending[t.category] = (catSpending[t.category] || 0) + parseInt(t.amount);
            });
            let highestCat = Object.keys(catSpending).sort((a,b)=>catSpending[b]-catSpending[a])[0];
            if(highestCat && appData.budgets[highestCat]) {
                let pct = (catSpending[highestCat] / appData.budgets[highestCat]) * 100;
                if(pct > 80) engine.insights.push({text: `${highestCat} budget is ${Math.round(pct)}% used.`, icon: '🔥'});
            }
        }

        /* =========================================
           3. UI RENDERING & THEMING
           ========================================= */
        const fmt = new Intl.NumberFormat('en-IN');

        function updateUI() {
            // Apply Theme
            document.body.setAttribute('data-mood', engine.mood);
            
            // Update Dashboard
            document.getElementById('greeting').innerText = `Good evening, ${appData.profile.name}`;
            document.getElementById('dash-wallet-balance').innerText = `₹${fmt.format(engine.walletBalance)}`;
            document.getElementById('dash-spent-month').innerText = `₹${fmt.format(engine.totalVariable)}`;
            
            document.getElementById('dash-income').innerText = `₹${fmt.format(engine.totalIncome)}`;
            document.getElementById('dash-fixed').innerText = `₹${fmt.format(engine.totalFixed)}`;
            document.getElementById('dash-daily').innerText = `₹${fmt.format(engine.totalVariable)}`;
            document.getElementById('dash-safe').innerText = `₹${fmt.format(engine.safeDaily)}`;

            // Pace Score UI
            document.getElementById('dash-pace-score').innerText = engine.paceScore;
            let circle = document.getElementById('dash-pace-circle');
            let offset = 251.2 - (251.2 * engine.paceScore / 100);
            circle.style.strokeDashoffset = offset;

            // Mood Message
            let moodMsg = document.getElementById('dash-mood-message');
            let msgs = {
                'peaceful': 'You\'re starting strong. Spending looks great.',
                'healthy': 'You\'re on track with a healthy pace.',
                'caution': 'Keep an eye on your daily spending.',
                'warning': 'Your spending pace is getting high.',
                'critical': 'You\'re running very low. Cut back today.',
                'overdrawn': 'You\'ve exceeded your available money!'
            };
            moodMsg.querySelector('span').innerText = msgs[engine.mood];

            // Render Insights
            let insHtml = engine.insights.map(i => `
                <li style="display:flex; gap:12px; font-weight:500; font-size:0.875rem">
                    <span style="font-size:1.1rem">${i.icon}</span> ${i.text}
                </li>
            `).join('');
            document.getElementById('dash-insights').innerHTML = insHtml || '<li class="text-muted text-sm">No new insights.</li>';

            // Render Recent TX
            let recents = [...appData.transactions].sort((a,b)=> b.id - a.id).slice(0, 4);
            if(recents.length === 0) {
                document.getElementById('dash-recent-tx').innerHTML = `
                    <div class="empty-state">
                        <p>Your wallet is quiet.</p>
                        <button class="add-btn" style="margin: 16px auto" onclick="openModal('addExpenseModal')">+ Add First Expense</button>
                    </div>`;
            } else {
                document.getElementById('dash-recent-tx').innerHTML = recents.map(t => txListItem(t)).join('');
            }

            renderCalendar();
            renderFixed();
            renderBudgets();
            renderAnalytics();
            
            // Pre-fill settings
            document.getElementById('set-name').value = appData.profile.name;
            document.getElementById('set-income').value = appData.profile.monthlyIncome;
        }

        function txListItem(t) {
            let isExp = t.type === 'expense';
            return `
            <div class="list-item">
                <div class="list-item-left">
                    <div class="item-icon" style="background:${isExp ? 'var(--bg)' : '#dcfce7'}; color:${isExp ? 'var(--text-main)' : '#166534'}">
                        ${isExp ? getIconForCat(t.category) : '↓'}
                    </div>
                    <div class="item-details">
                        <h4>${t.desc}</h4>
                        <p>${t.category} • Sept ${t.date}</p>
                    </div>
                </div>
                <div style="text-align:right">
                    <div class="item-amount" style="color:${isExp ? 'inherit' : 'var(--success)'}">${isExp ? '-' : '+'}₹${fmt.format(t.amount)}</div>
                    <div class="item-actions">
                        <button class="action-btn" onclick="deleteTx(${t.id})">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
            </div>`;
        }

        function getIconForCat(cat) {
            const m = { 'Food':'🍔', 'Transport':'🚌', 'Shopping':'🛍️', 'Entertainment':'🎬', 'Bills':'💡', 'Health':'💊', 'Personal':'💇', 'Other':'📦', 'Housing':'🏠', 'Subscriptions':'📺', 'Insurance':'🛡️', 'EMI':'🏦' };
            return m[cat] || '🏷️';
        }

        function renderCalendar() {
            let grid = document.querySelector('.calendar-grid');
            // Clear existing days (keep headers)
            let headers = `
                <div class="calendar-day-header">MON</div><div class="calendar-day-header">TUE</div><div class="calendar-day-header">WED</div>
                <div class="calendar-day-header">THU</div><div class="calendar-day-header">FRI</div><div class="calendar-day-header">SAT</div><div class="calendar-day-header">SUN</div>
            `;
            grid.innerHTML = headers;
            
            // Sept 2026 starts on a Tuesday (index 1 if Mon=0)
            let offset = 1; 
            for(let i=0; i<offset; i++) {
                grid.innerHTML += `<div class="calendar-day empty"></div>`;
            }

            for(let day=1; day<=30; day++) {
                let spent = engine.spentByDay[day] || 0;
                let intensityClass = 'intensity-0';
                
                if (spent > 0) {
                    if (engine.safeDaily > 0) {
                        let ratio = spent / engine.safeDaily;
                        if (ratio < 0.5) intensityClass = 'intensity-1';
                        else if (ratio <= 1.0) intensityClass = 'intensity-2';
                        else if (ratio <= 1.5) intensityClass = 'intensity-3';
                        else if (ratio <= 2.0) intensityClass = 'intensity-4';
                        else intensityClass = 'intensity-5';
                    } else {
                        intensityClass = 'intensity-3'; // Default if safeDaily is 0
                    }
                }

                let todayHighlight = day === CURRENT_DAY ? 'border: 2px solid var(--accent);' : '';

                grid.innerHTML += `
                    <div class="calendar-day" style="${todayHighlight}" onclick="openDayDetail(${day})">
                        <span class="cal-date">${day}</span>
                        ${spent > 0 ? `<div class="cal-amount">₹${fmt.format(spent)}</div>` : ''}
                        ${spent > 0 ? `<div class="cal-indicator ${intensityClass}"></div>` : ''}
                    </div>
                `;
            }
        }

        function renderFixed() {
            let list = document.getElementById('fixed-list');
            document.getElementById('fixed-total-header').innerText = `₹${fmt.format(engine.totalFixed)}`;
            
            if(appData.fixedExpenses.length === 0) {
                list.innerHTML = `<div class="empty-state"><p>No recurring commitments yet.</p></div>`;
                return;
            }

            let sorted = [...appData.fixedExpenses].sort((a,b) => a.dueDate - b.dueDate);
            list.innerHTML = sorted.map(f => {
                let isPaid = f.dueDate < CURRENT_DAY;
                let statusBadge = isPaid 
                    ? `<span class="badge badge-success">✓ Paid</span>` 
                    : `<span class="badge badge-warning">Due: ${f.dueDate}</span>`;
                
                return `
                <div class="list-item">
                    <div class="list-item-left">
                        <div class="item-icon">${getIconForCat(f.category)}</div>
                        <div class="item-details">
                            <h4>${f.name}</h4>
                            <p>${f.category}</p>
                        </div>
                    </div>
                    <div style="text-align:right; display:flex; align-items:center; gap:16px;">
                        ${statusBadge}
                        <div class="item-amount">₹${fmt.format(f.amount)}</div>
                        <div class="item-actions">
                            <button class="action-btn" onclick="deleteFixed(${f.id})">Delete</button>
                        </div>
                    </div>
                </div>
                `;
            }).join('');
        }

        function renderBudgets() {
            let list = document.getElementById('budgets-list');
            
            let catSpending = {};
            appData.transactions.filter(t=>t.type==='expense').forEach(t=>{
                catSpending[t.category] = (catSpending[t.category] || 0) + parseInt(t.amount);
            });

            let html = '';
            for(let [cat, limit] of Object.entries(appData.budgets)) {
                let spent = catSpending[cat] || 0;
                let pct = Math.min((spent / limit) * 100, 100);
                let isExceeded = spent > limit;
                
                html += `
                <div class="budget-item ${isExceeded ? 'budget-exceeded' : ''}">
                    <div class="budget-header">
                        <span class="font-medium">${getIconForCat(cat)} ${cat}</span>
                        <span class="text-sm"><span class="${isExceeded?'font-bold':''}" style="${isExceeded?'color:var(--danger)':''}">₹${fmt.format(spent)}</span> / ₹${fmt.format(limit)}</span>
                    </div>
                    <div class="budget-bar-bg">
                        <div class="budget-bar-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
                `;
            }
            list.innerHTML = html || '<p class="text-muted text-sm">No budgets set.</p>';
        }

        function renderAnalytics() {
            document.getElementById('stat-tot-income').innerText = `₹${fmt.format(engine.totalIncome)}`;
            document.getElementById('stat-tot-expenses').innerText = `₹${fmt.format(engine.totalFixed + engine.totalVariable)}`;
            let savings = engine.totalIncome - (engine.totalFixed + engine.totalVariable);
            document.getElementById('stat-savings').innerText = `₹${fmt.format(savings)}`;
            let rate = engine.totalIncome > 0 ? ((savings / engine.totalIncome) * 100).toFixed(1) : 0;
            document.getElementById('stat-savings-rate').innerText = `${rate}%`;

            let catSpending = {};
            appData.transactions.filter(t=>t.type==='expense').forEach(t=>{
                catSpending[t.category] = (catSpending[t.category] || 0) + parseInt(t.amount);
            });
            let sortedCats = Object.keys(catSpending).sort((a,b)=>catSpending[b]-catSpending[a]);
            let highCat = sortedCats[0];
            document.getElementById('stat-high-cat').innerText = highCat ? `${highCat} (₹${fmt.format(catSpending[highCat])})` : '-';

            // Chart
            let chartContainer = document.getElementById('analytics-chart');
            if(sortedCats.length === 0) {
                chartContainer.innerHTML = '<p class="text-muted text-sm" style="margin:auto">Not enough data for chart.</p>';
                return;
            }
            let maxVal = catSpending[sortedCats[0]];
            let top5 = sortedCats.slice(0,5);
            chartContainer.innerHTML = top5.map(cat => {
                let val = catSpending[cat];
                let height = (val / maxVal) * 100;
                return `
                    <div class="chart-bar-wrap">
                        <div class="chart-bar" style="height: ${height}%"></div>
                        <span class="chart-label">${cat.substring(0,3)}</span>
                    </div>
                `;
            }).join('');
        }

        /* =========================================
           4. INTERACTIONS & LOGIC
           ========================================= */

        // Navigation
        const navItems = document.querySelectorAll('.nav-item, .mobile-nav-item');
        const views = document.querySelectorAll('.view-section');
        
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                let target = item.getAttribute('data-target');
                navTo(target);
            });
        });

        function navTo(target) {
            navItems.forEach(n => {
                if(n.getAttribute('data-target') === target) n.classList.add('active');
                else n.classList.remove('active');
            });
            views.forEach(v => {
                if(v.id === `view-${target}`) v.classList.add('active');
                else v.classList.remove('active');
            });
            window.scrollTo(0,0);
        }

        // Modals
        function openModal(id) {
            document.getElementById(id).classList.add('active');
        }
        function closeModal(id) {
            document.getElementById(id).classList.remove('active');
            if(id === 'addExpenseModal') document.getElementById('expenseForm').reset();
            if(id === 'addFixedModal') document.getElementById('fixedForm').reset();
        }

        function openDayDetail(day) {
            let txs = appData.transactions.filter(t => t.date === day);
            document.getElementById('dayDetailTitle').innerText = `Sept ${day}, 2026`;
            let total = txs.filter(t=>t.type==='expense').reduce((sum, t) => sum + parseInt(t.amount), 0);
            document.getElementById('dayDetailTotal').innerText = `₹${fmt.format(total)}`;
            
            let list = document.getElementById('dayDetailList');
            if(txs.length === 0) {
                list.innerHTML = `<p class="text-muted text-sm text-center">No transactions on this day.</p>`;
            } else {
                list.innerHTML = txs.map(t => txListItem(t)).join('');
            }
            openModal('dayDetailModal');
        }

        // Form Submissions
        document.getElementById('expenseForm').addEventListener('submit', (e) => {
            e.preventDefault();
            let tx = {
                id: Date.now(),
                type: document.getElementById('txType').value,
                amount: parseInt(document.getElementById('txAmount').value),
                category: document.getElementById('txCategory').value,
                date: parseInt(document.getElementById('txDate').value),
                method: document.getElementById('txMethod').value,
                desc: document.getElementById('txDesc').value
            };
            appData.transactions.push(tx);
            saveData();
            closeModal('addExpenseModal');
            showToast('Transaction added successfully.', 'success');
            
            // If day modal is open and we added to that day, refresh it
            if(document.getElementById('dayDetailModal').classList.contains('active')) {
                openDayDetail(tx.date); 
            }
        });

        document.getElementById('fixedForm').addEventListener('submit', (e) => {
            e.preventDefault();
            let fx = {
                id: Date.now(),
                name: document.getElementById('fixName').value,
                amount: parseInt(document.getElementById('fixAmount').value),
                dueDate: parseInt(document.getElementById('fixDate').value),
                category: document.getElementById('fixCategory').value
            };
            appData.fixedExpenses.push(fx);
            saveData();
            closeModal('addFixedModal');
            showToast('Fixed expense added.', 'success');
        });

        document.getElementById('settingsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            appData.profile.name = document.getElementById('set-name').value;
            appData.profile.monthlyIncome = parseInt(document.getElementById('set-income').value);
            saveData();
            showToast('Profile saved.', 'success');
        });

        // Actions
        window.deleteTx = function(id) {
            if(confirm("Delete transaction?")) {
                let tx = appData.transactions.find(t=>t.id===id);
                appData.transactions = appData.transactions.filter(t => t.id !== id);
                saveData();
                showToast('Transaction deleted.');
                if(tx && document.getElementById('dayDetailModal').classList.contains('active')) {
                    openDayDetail(tx.date); 
                }
            }
        };

        window.deleteFixed = function(id) {
            if(confirm("Delete fixed expense?")) {
                appData.fixedExpenses = appData.fixedExpenses.filter(f => f.id !== id);
                saveData();
                showToast('Fixed expense deleted.');
            }
        };

        // Toast
        function showToast(msg, type='info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${msg}`;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        /* =========================================
           5. INIT
           ========================================= */
        window.addEventListener('DOMContentLoaded', () => {
            loadData();
            calculateEngine();
        });

