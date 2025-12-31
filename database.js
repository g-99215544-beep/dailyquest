// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
    apiKey: "AIzaSyCzjLQqOFHFKLescOm3XeNtP5vceNInW6s",
    authDomain: "dailyquest-e7d7b.firebaseapp.com",
    databaseURL: "https://dailyquest-e7d7b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "dailyquest-e7d7b",
    storageBucket: "dailyquest-e7d7b.firebasestorage.app",
    messagingSenderId: "372073463598",
    appId: "1:372073463598:web:22aaa1c892a2256369c4bf",
    measurementId: "G-JMXNMVMZL5"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ===== GLOBAL STATE =====
let currentUser = null;
let questTemplates = [];
let todayQuests = [];
let persistentQuests = [];
let userProfile = null;
let groceryItems = []; // Temporary storage for grocery items in modal

// ===== CATEGORY ICONS & NAMES =====
const categoryIcons = {
    home: '🏠',
    work: '💼',
    fitness: '💪',
    learning: '📚',
    self: '🧘',
    groceries: '🛒',
    other: '✨'
};

const categoryNames = {
    home: 'Rumah',
    work: 'Kerja',
    fitness: 'Kecergasan',
    learning: 'Pembelajaran',
    self: 'Self-care',
    groceries: 'Groceries',
    other: 'Lain-lain'
};

// ===== EXP VALUES =====
const EXP_DAILY_QUEST = 10;
const EXP_PERSISTENT_QUEST = 50;
const EXP_GROCERY_ITEM = 5;
const EXP_COMPLETE_ALL_BONUS = 20;

// ===== HELPER FUNCTIONS =====
function getTodayDate() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function getTodayDayOfWeek() {
    return new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
}

function generateIdCode(uid) {
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
        hash = ((hash << 5) - hash) + uid.charCodeAt(i);
        hash = hash & hash;
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let absHash = Math.abs(hash);
    for (let i = 0; i < 6; i++) {
        code += chars[absHash % chars.length];
        absHash = Math.floor(absHash / chars.length);
    }
    return code;
}

function calculateLevel(exp) {
    let level = 1;
    let totalExp = 0;
    while (totalExp + (level * 100) <= exp) {
        totalExp += level * 100;
        level++;
    }
    return {
        level,
        currentExp: exp - totalExp,
        expToNext: level * 100
    };
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ===== AUTHENTICATION FUNCTIONS =====
function checkAuthState() {
    const savedCreds = localStorage.getItem('dailyquest_creds');
    if (savedCreds) {
        const { idCode, pin } = JSON.parse(savedCreds);
        loginWithIdCode(idCode, pin);
    } else {
        showLoginScreen();
    }
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
}

function showAppScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'flex';
}

async function loginWithGoogle() {
    try {
        const result = await auth.signInWithPopup(googleProvider);
        currentUser = result.user;
        
        const userSnapshot = await db.ref(`users/${currentUser.uid}`).once('value');
        
        if (!userSnapshot.exists()) {
            showPinSetupModal();
        } else {
            userProfile = userSnapshot.val();
            localStorage.setItem('dailyquest_creds', JSON.stringify({
                idCode: userProfile.idCode,
                pin: userProfile.pin
            }));
            initApp();
        }
    } catch (error) {
        console.error('Google login error:', error);
        showToast('Ralat log masuk: ' + error.message);
    }
}

async function loginWithIdCode(idCode, pin) {
    try {
        const usersSnapshot = await db.ref('users').orderByChild('idCode').equalTo(idCode.toUpperCase()).once('value');
        
        if (!usersSnapshot.exists()) {
            showToast('ID Code tidak dijumpai');
            showLoginScreen();
            return;
        }
        
        const userData = Object.values(usersSnapshot.val())[0];
        const uid = Object.keys(usersSnapshot.val())[0];
        
        if (userData.pin !== pin) {
            showToast('PIN tidak tepat');
            return;
        }
        
        userProfile = userData;
        currentUser = { uid, email: userData.email, displayName: userData.displayName };
        
        localStorage.setItem('dailyquest_creds', JSON.stringify({ idCode, pin }));
        
        closeIdLoginModal();
        initApp();
    } catch (error) {
        console.error('ID Code login error:', error);
        showToast('Ralat log masuk');
    }
}

function showPinSetupModal() {
    document.getElementById('pinSetupModal').classList.add('active');
}

function closePinSetupModal() {
    document.getElementById('pinSetupModal').classList.remove('active');
}

async function setupPin() {
    const newPin = document.getElementById('newPinInput').value;
    const confirmPin = document.getElementById('confirmPinInput').value;
    
    if (!newPin || newPin.length !== 4) {
        showToast('PIN mestilah 4 digit');
        return;
    }
    
    if (newPin !== confirmPin) {
        showToast('PIN tidak sepadan');
        return;
    }
    
    try {
        const idCode = generateIdCode(currentUser.uid);
        
        await db.ref(`users/${currentUser.uid}`).set({
            displayName: currentUser.displayName,
            email: currentUser.email,
            idCode,
            pin: newPin,
            totalExp: 0,
            createdAt: Date.now()
        });
        
        userProfile = {
            displayName: currentUser.displayName,
            email: currentUser.email,
            idCode,
            pin: newPin,
            totalExp: 0
        };
        
        localStorage.setItem('dailyquest_creds', JSON.stringify({ idCode, pin: newPin }));
        
        closePinSetupModal();
        showToast('Akaun berjaya dibuat!');
        initApp();
    } catch (error) {
        console.error('PIN setup error:', error);
        showToast('Ralat menyimpan PIN');
    }
}

function logout() {
    if (confirm('Adakah anda pasti mahu log keluar?')) {
        localStorage.removeItem('dailyquest_creds');
        auth.signOut();
        currentUser = null;
        userProfile = null;
        questTemplates = [];
        todayQuests = [];
        persistentQuests = [];
        showLoginScreen();
        showToast('Berjaya log keluar');
    }
}

// ===== APP INITIALIZATION =====
async function initApp() {
    showAppScreen();
    
    // Load user data first
    await loadUserProfile();
    
    // Load templates first (needed to identify orphaned quests)
    await loadTemplates();
    
    // Load quests (will auto-cleanup orphaned quests)
    await loadPersistentQuests();
    await generateTodayQuests();
    await loadTodayQuests(); // This now includes orphan cleanup
    
    // Render all
    renderUserInfo();
    await renderWeekSummary();
    renderTodayQuests();
    renderPersistentQuests();
    renderTemplates();
    updateProgress();
}

async function loadUserProfile() {
    try {
        const snapshot = await db.ref(`users/${currentUser.uid}`).once('value');
        if (snapshot.exists()) {
            userProfile = snapshot.val();
        }
    } catch (error) {
        console.error('Load user profile error:', error);
    }
}

async function loadTemplates() {
    try {
        const snapshot = await db.ref(`questTemplates/${currentUser.uid}`).once('value');
        questTemplates = [];
        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                questTemplates.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }
    } catch (error) {
        console.error('Load templates error:', error);
    }
}

async function loadPersistentQuests() {
    try {
        const snapshot = await db.ref(`persistentQuests/${currentUser.uid}`).once('value');
        persistentQuests = [];
        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                persistentQuests.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }
        
        const today = getTodayDate();
        const completedToRemove = persistentQuests.filter(q => 
            q.status === 'completed' && q.completedDate && q.completedDate !== today
        );
        
        for (const quest of completedToRemove) {
            await db.ref(`persistentQuests/${currentUser.uid}/${quest.id}`).remove();
        }
        
        persistentQuests = persistentQuests.filter(q => 
            q.status !== 'completed' || q.completedDate === today
        );
    } catch (error) {
        console.error('Load persistent quests error:', error);
    }
}

async function generateTodayQuests() {
    const today = getTodayDate();
    const todayDay = getTodayDayOfWeek();
    
    try {
        for (const template of questTemplates) {
            if (template.daysOfWeek && template.daysOfWeek.includes(todayDay)) {
                const existingSnapshot = await db.ref(`dailyQuests/${currentUser.uid}/${today}`)
                    .orderByChild('templateId')
                    .equalTo(template.id)
                    .once('value');
                
                if (!existingSnapshot.exists()) {
                    const newQuestRef = db.ref(`dailyQuests/${currentUser.uid}/${today}`).push();
                    await newQuestRef.set({
                        templateId: template.id,
                        title: template.title,
                        category: template.category,
                        status: 'pending',
                        createdAt: Date.now(),
                        completedAt: null,
                        verifiedAt: null
                    });
                }
            }
        }
    } catch (error) {
        console.error('Generate today quests error:', error);
    }
}

async function loadTodayQuests() {
    const today = getTodayDate();
    
    try {
        const snapshot = await db.ref(`dailyQuests/${currentUser.uid}/${today}`).once('value');
        todayQuests = [];
        const orphanedQuests = []; // Track orphaned quests for cleanup
        
        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                const quest = child.val();
                
                // Check if template still exists (skip orphaned quests)
                const templateExists = questTemplates.some(t => t.id === quest.templateId);
                
                if (templateExists) {
                    todayQuests.push({
                        id: child.key,
                        ...quest
                    });
                } else {
                    // Template deleted, mark quest as orphaned
                    orphanedQuests.push(child.key);
                }
            });
            
            // Clean up orphaned quests
            if (orphanedQuests.length > 0) {
                const updates = {};
                orphanedQuests.forEach(questId => {
                    updates[questId] = null; // Mark for deletion
                });
                await db.ref(`dailyQuests/${currentUser.uid}/${today}`).update(updates);
                console.log(`Cleaned up ${orphanedQuests.length} orphaned quests`);
            }
        }
    } catch (error) {
        console.error('Load today quests error:', error);
    }
}

// ===== RENDER FUNCTIONS =====
function renderUserInfo() {
    document.getElementById('userName').textContent = userProfile.displayName || '-';
    document.getElementById('userEmail').textContent = userProfile.email || '-';
    document.getElementById('userIdCode').textContent = userProfile.idCode || '------';
    
    const levelInfo = calculateLevel(userProfile.totalExp || 0);
    document.getElementById('levelBadge').textContent = `Level ${levelInfo.level}`;
    document.getElementById('settingsLevel').textContent = `Level ${levelInfo.level}`;
    document.getElementById('settingsExp').textContent = `${levelInfo.currentExp} / ${levelInfo.expToNext} EXP`;
    
    const progressPercent = (levelInfo.currentExp / levelInfo.expToNext) * 100;
    document.getElementById('levelProgressFill').style.width = `${progressPercent}%`;
}

async function renderWeekSummary() {
    const today = getTodayDayOfWeek();
    
    // Get current week's start and end dates
    const now = new Date();
    const currentDay = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - currentDay + (currentDay === 0 ? -6 : 1)); // Start from Monday
    
    // Load quest data for the week
    for (let i = 0; i <= 6; i++) {
        const dayIndex = (i + 1) % 7; // Convert: 0=Mon -> 1, 1=Tue -> 2, ..., 6=Sun -> 0
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        
        const dayEl = document.querySelector(`.week-day[data-day="${dayIndex}"]`);
        const displayEl = dayEl.querySelector('span:last-child');
        
        if (dayIndex === today) {
            dayEl.classList.add('today');
        } else {
            dayEl.classList.remove('today');
        }
        
        // Load quests for this date
        try {
            const snapshot = await db.ref(`dailyQuests/${currentUser.uid}/${dateStr}`).once('value');
            
            if (snapshot.exists()) {
                const quests = [];
                snapshot.forEach((child) => {
                    quests.push(child.val());
                });
                
                const total = quests.length;
                const completed = quests.filter(q => q.status === 'completed' || q.status === 'verified').length;
                
                if (total > 0) {
                    if (completed === total) {
                        displayEl.textContent = '✓';
                        displayEl.style.color = '#6bcf7f';
                        displayEl.style.fontSize = '1.5rem';
                    } else {
                        displayEl.textContent = `${completed}/${total}`;
                        displayEl.style.fontSize = '0.85rem';
                        displayEl.style.fontWeight = '700';
                    }
                } else {
                    displayEl.textContent = '·';
                    displayEl.style.fontSize = '1.4rem';
                }
            } else {
                displayEl.textContent = '·';
                displayEl.style.fontSize = '1.4rem';
            }
        } catch (error) {
            console.error('Error loading week summary:', error);
            displayEl.textContent = '·';
        }
    }
}

function renderTodayQuests() {
    const container = document.getElementById('dailyQuestList');
    
    if (todayQuests.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <div class="empty-state-text">Tiada quest untuk hari ini</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = todayQuests.map(quest => `
        <div class="quest-item ${quest.status === 'completed' || quest.status === 'verified' ? 'completed' : ''}" onclick="toggleDailyQuest('${quest.id}')">
            <div class="quest-checkbox"></div>
            <div class="quest-info">
                <div class="quest-title">${quest.title}</div>
                <div class="quest-meta">
                    <span class="quest-category">${categoryIcons[quest.category]} ${categoryNames[quest.category]}</span>
                    <span class="quest-exp">+${EXP_DAILY_QUEST} EXP</span>
                </div>
            </div>
            ${quest.status === 'completed' ? '<span class="quest-badge complete">✅ Complete</span>' : ''}
        </div>
    `).join('');
}

function renderPersistentQuests() {
    const container = document.getElementById('persistentQuestList');
    
    if (persistentQuests.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📌</div>
                <div class="empty-state-text">Tiada quest berterusan</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = persistentQuests.map(quest => {
        // Handle groceries with items
        if (quest.category === 'groceries' && quest.items && quest.items.length > 0) {
            const completedCount = quest.items.filter(item => item.completed).length;
            const totalCount = quest.items.length;
            const allComplete = completedCount === totalCount;
            
            return `
                <div class="quest-item ${allComplete ? 'completed' : ''}" style="flex-direction: column; align-items: stretch;">
                    <div style="display: flex; align-items: center; gap: 12px; cursor: default;">
                        <div class="quest-checkbox" style="pointer-events: none;"></div>
                        <div class="quest-info" style="flex: 1;">
                            <div class="quest-title">${quest.title}</div>
                            <div class="quest-meta">
                                <span class="quest-category">${categoryIcons[quest.category]} ${categoryNames[quest.category]}</span>
                                <span class="quest-exp" style="font-weight: 700;">${completedCount}/${totalCount} items</span>
                            </div>
                        </div>
                        ${allComplete ? '<span class="quest-badge complete">✅ Complete</span>' : ''}
                    </div>
                    <div style="margin-left: 44px; margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                        ${quest.items.map((item, index) => `
                            <div class="grocery-item ${item.completed ? 'completed' : ''}" onclick="toggleGroceryItem('${quest.id}', ${index})" style="display: flex; align-items: center; gap: 10px; padding: 10px; background: ${item.completed ? 'rgba(107, 207, 127, 0.1)' : 'rgba(162, 155, 254, 0.1)'}; border-radius: 12px; cursor: pointer; transition: all 0.3s;">
                                <div style="width: 24px; height: 24px; border: 3px solid ${item.completed ? '#6bcf7f' : '#a29bfe'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${item.completed ? '#6bcf7f' : 'transparent'}; transition: all 0.3s;">
                                    ${item.completed ? '<span style="color: white; font-size: 14px; font-weight: bold;">✓</span>' : ''}
                                </div>
                                <span style="flex: 1; font-weight: 600; ${item.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${item.name}</span>
                                <span class="quest-exp" style="font-size: 0.85rem;">+${EXP_GROCERY_ITEM} EXP</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Handle regular persistent quests
        return `
            <div class="quest-item ${quest.status === 'completed' ? 'completed' : ''}" onclick="togglePersistentQuest('${quest.id}')">
                <div class="quest-checkbox"></div>
                <div class="quest-info">
                    <div class="quest-title">${quest.title}</div>
                    <div class="quest-meta">
                        <span class="quest-category">${categoryIcons[quest.category]} ${categoryNames[quest.category]}</span>
                        <span class="quest-exp">+${EXP_PERSISTENT_QUEST} EXP</span>
                    </div>
                </div>
                ${quest.status === 'completed' ? '<span class="quest-badge complete">✅ Complete</span>' : ''}
            </div>
        `;
    }).join('');
}

function renderTemplates() {
    const container = document.getElementById('templateList');
    const persistentContainer = document.getElementById('persistentManageList');
    
    if (questTemplates.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔄</div>
                <div class="empty-state-text">Tiada template quest</div>
            </div>
        `;
    } else {
        container.innerHTML = questTemplates.map(template => {
            const dayNames = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'];
            // Filter out invalid day values and map to names
            const days = template.daysOfWeek
                .filter(d => d >= 0 && d <= 6) // Only valid days (0-6)
                .map(d => dayNames[d])
                .join(', ');
            
            return `
                <div class="template-item">
                    <div class="template-header">
                        <div class="template-title">
                            ${categoryIcons[template.category]} ${template.title}
                        </div>
                        <div class="template-actions">
                            <button class="btn-icon" onclick="editTemplate('${template.id}')">✏️</button>
                            <button class="btn-icon danger" onclick="deleteTemplate('${template.id}')">🗑️</button>
                        </div>
                    </div>
                    <div class="template-days">
                        ${template.daysOfWeek
                            .filter(d => d >= 0 && d <= 6)
                            .map(d => `<span class="day-tag">${dayNames[d]}</span>`)
                            .join('')}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    if (persistentQuests.length === 0) {
        persistentContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📌</div>
                <div class="empty-state-text">Tiada quest berterusan</div>
            </div>
        `;
    } else {
        persistentContainer.innerHTML = persistentQuests.map(quest => `
            <div class="template-item">
                <div class="template-header">
                    <div class="template-title">
                        ${categoryIcons[quest.category]} ${quest.title}
                        ${quest.status === 'completed' ? '<span class="quest-badge complete">✅</span>' : ''}
                    </div>
                    <div class="template-actions">
                        <button class="btn-icon danger" onclick="deletePersistentQuest('${quest.id}')">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

function updateProgress() {
    const completed = todayQuests.filter(q => q.status === 'completed' || q.status === 'verified').length;
    const total = todayQuests.length;
    
    document.getElementById('questProgress').textContent = `${completed}/${total}`;
    
    const percent = total > 0 ? (completed / total) * 100 : 0;
    document.getElementById('progressFill').style.width = `${percent}%`;
}

// ===== QUEST ACTIONS =====
async function toggleDailyQuest(questId) {
    const quest = todayQuests.find(q => q.id === questId);
    if (!quest) return;
    
    const today = getTodayDate();
    const newStatus = (quest.status === 'pending') ? 'completed' : 'pending';
    
    try {
        await db.ref(`dailyQuests/${currentUser.uid}/${today}/${questId}`).update({
            status: newStatus,
            completedAt: newStatus === 'completed' ? Date.now() : null
        });
        
        quest.status = newStatus;
        quest.completedAt = newStatus === 'completed' ? Date.now() : null;
        
        if (newStatus === 'completed') {
            await updateExp(EXP_DAILY_QUEST);
            
            const allCompleted = todayQuests.every(q => q.status === 'completed' || q.status === 'verified');
            if (allCompleted) {
                await updateExp(EXP_COMPLETE_ALL_BONUS);
                showToast('🎉 Semua quest selesai! Bonus +' + EXP_COMPLETE_ALL_BONUS + ' EXP');
            }
        } else {
            await updateExp(-EXP_DAILY_QUEST);
        }
        
        renderTodayQuests();
        updateProgress();
        renderUserInfo();
        renderWeekSummary(); // Update week summary
    } catch (error) {
        console.error('Toggle quest error:', error);
        showToast('Ralat mengemas kini quest');
    }
}

async function togglePersistentQuest(questId) {
    const quest = persistentQuests.find(q => q.id === questId);
    if (!quest) return;
    
    const today = getTodayDate();
    const newStatus = (quest.status === 'pending') ? 'completed' : 'pending';
    
    try {
        await db.ref(`persistentQuests/${currentUser.uid}/${questId}`).update({
            status: newStatus,
            completedAt: newStatus === 'completed' ? Date.now() : null,
            completedDate: newStatus === 'completed' ? today : null
        });
        
        quest.status = newStatus;
        quest.completedAt = newStatus === 'completed' ? Date.now() : null;
        quest.completedDate = newStatus === 'completed' ? today : null;
        
        if (newStatus === 'completed') {
            await updateExp(EXP_PERSISTENT_QUEST);
        } else {
            await updateExp(-EXP_PERSISTENT_QUEST);
        }
        
        renderPersistentQuests();
        renderTemplates();
        renderUserInfo();
    } catch (error) {
        console.error('Toggle persistent quest error:', error);
        showToast('Ralat mengemas kini quest');
    }
}

async function toggleGroceryItem(questId, itemIndex) {
    const quest = persistentQuests.find(q => q.id === questId);
    if (!quest || !quest.items || !quest.items[itemIndex]) return;
    
    const item = quest.items[itemIndex];
    const wasCompleted = item.completed;
    item.completed = !wasCompleted;
    
    try {
        // Update item in database
        await db.ref(`persistentQuests/${currentUser.uid}/${questId}/items/${itemIndex}`).update({
            completed: item.completed
        });
        
        // Award or remove EXP
        if (item.completed) {
            await updateExp(EXP_GROCERY_ITEM);
        } else {
            await updateExp(-EXP_GROCERY_ITEM);
        }
        
        // Check if all items complete
        const allComplete = quest.items.every(item => item.completed);
        if (allComplete && !wasCompleted) {
            // Just completed last item - give bonus!
            await updateExp(EXP_COMPLETE_ALL_BONUS);
            showToast('🎉 Semua barang selesai! Bonus +' + EXP_COMPLETE_ALL_BONUS + ' EXP');
            
            // Mark quest as completed and auto-delete
            await db.ref(`persistentQuests/${currentUser.uid}/${questId}`).update({
                status: 'completed',
                completedAt: Date.now(),
                completedDate: getTodayDate()
            });
            
            // Remove from list after short delay
            setTimeout(async () => {
                await db.ref(`persistentQuests/${currentUser.uid}/${questId}`).remove();
                persistentQuests = persistentQuests.filter(q => q.id !== questId);
                renderPersistentQuests();
                renderTemplates();
                updateProgress();
            }, 2000);
        } else if (!allComplete && wasCompleted) {
            // Was complete, now incomplete - check if need to remove bonus
            const completedItems = quest.items.filter(i => i.completed).length;
            if (completedItems === quest.items.length - 1) {
                // Was just at complete bonus, remove it
                await updateExp(-EXP_COMPLETE_ALL_BONUS);
            }
        }
        
        renderPersistentQuests();
        renderUserInfo();
    } catch (error) {
        console.error('Toggle grocery item error:', error);
        showToast('Ralat mengemas kini barang');
    }
}

async function updateExp(amount) {
    try {
        const newExp = (userProfile.totalExp || 0) + amount;
        await db.ref(`users/${currentUser.uid}`).update({
            totalExp: newExp
        });
        userProfile.totalExp = newExp;
    } catch (error) {
        console.error('Update EXP error:', error);
    }
}

// ===== ADD/EDIT QUEST FUNCTIONS =====
function openAddQuestModal() {
    document.getElementById('modalTitle').textContent = 'Tambah Quest';
    document.getElementById('questTitleInput').value = '';
    document.getElementById('questCategorySelect').value = 'home';
    document.getElementById('editTemplateId').value = '';
    
    // Clear grocery items
    groceryItems = [];
    renderGroceryItems();
    updateGrocerySection();
    
    setQuestType('daily');
    
    const today = getTodayDayOfWeek();
    document.querySelectorAll('.day-checkbox input').forEach(input => {
        input.checked = (parseInt(input.value) === today);
    });
    
    document.getElementById('addQuestModal').classList.add('active');
}

function closeAddQuestModal() {
    document.getElementById('addQuestModal').classList.remove('active');
}

function setQuestType(type) {
    const dailyBtn = document.getElementById('dailyTypeBtn');
    const persistentBtn = document.getElementById('persistentTypeBtn');
    const daysSection = document.getElementById('daysSection');
    
    if (type === 'daily') {
        dailyBtn.classList.add('active');
        persistentBtn.classList.remove('active');
        daysSection.style.display = 'block';
    } else {
        persistentBtn.classList.add('active');
        dailyBtn.classList.remove('active');
        daysSection.style.display = 'none';
    }
    
    // Update grocery section visibility
    updateGrocerySection();
}

// ===== GROCERY ITEMS MANAGEMENT =====
function updateGrocerySection() {
    const category = document.getElementById('questCategorySelect').value;
    const isPersistent = document.getElementById('persistentTypeBtn').classList.contains('active');
    const grocerySection = document.getElementById('groceryItemsSection');
    
    // Show grocery items section only for persistent groceries quest
    if (category === 'groceries' && isPersistent) {
        grocerySection.style.display = 'block';
    } else {
        grocerySection.style.display = 'none';
    }
}

function addGroceryItem() {
    const input = document.getElementById('newGroceryItem');
    const itemName = input.value.trim();
    
    if (!itemName) {
        showToast('Sila masukkan nama barang');
        return;
    }
    
    groceryItems.push({
        name: itemName,
        completed: false
    });
    
    input.value = '';
    renderGroceryItems();
}

function removeGroceryItem(index) {
    groceryItems.splice(index, 1);
    renderGroceryItems();
}

function renderGroceryItems() {
    const container = document.getElementById('groceryItemsList');
    
    if (groceryItems.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.9rem; padding: 1rem; text-align: center;">Tiada barang ditambah</div>';
        return;
    }
    
    container.innerHTML = groceryItems.map((item, index) => `
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(162, 155, 254, 0.1); border-radius: 8px; margin-bottom: 6px;">
            <span style="flex: 1; font-weight: 600;">${item.name}</span>
            <button type="button" onclick="removeGroceryItem(${index})" class="btn-icon danger" style="padding: 6px 10px; font-size: 0.9rem;">🗑️</button>
        </div>
    `).join('');
}

async function saveQuest() {
    const title = document.getElementById('questTitleInput').value.trim();
    const category = document.getElementById('questCategorySelect').value;
    const isPersistent = document.getElementById('persistentTypeBtn').classList.contains('active');
    const editId = document.getElementById('editTemplateId').value;
    
    if (!title) {
        showToast('Sila masukkan tajuk quest');
        return;
    }
    
    try {
        if (isPersistent) {
            // Validate grocery items if category is groceries
            if (category === 'groceries' && groceryItems.length === 0) {
                showToast('Sila tambah sekurang-kurangnya satu barang');
                return;
            }
            
            if (editId) {
                // Edit existing (not implemented in Phase 1)
            } else {
                const questData = {
                    title,
                    category,
                    status: 'pending',
                    createdAt: Date.now()
                };
                
                // Add items array for groceries
                if (category === 'groceries') {
                    questData.items = groceryItems.map(item => ({
                        name: item.name,
                        completed: false
                    }));
                }
                
                const newQuestRef = db.ref(`persistentQuests/${currentUser.uid}`).push();
                await newQuestRef.set(questData);
                
                persistentQuests.push({
                    id: newQuestRef.key,
                    ...questData
                });
            }
        } else {
            const selectedDays = Array.from(document.querySelectorAll('.day-checkbox input:checked'))
                .map(input => parseInt(input.value));
            
            if (selectedDays.length === 0) {
                showToast('Sila pilih sekurang-kurangnya satu hari');
                return;
            }
            
            let templateId = editId; // Store template ID here
            
            if (editId) {
                await db.ref(`questTemplates/${currentUser.uid}/${editId}`).update({
                    title,
                    category,
                    daysOfWeek: selectedDays
                });
                
                const template = questTemplates.find(t => t.id === editId);
                if (template) {
                    template.title = title;
                    template.category = category;
                    template.daysOfWeek = selectedDays;
                }
            } else {
                const newTemplateRef = db.ref(`questTemplates/${currentUser.uid}`).push();
                await newTemplateRef.set({
                    title,
                    category,
                    daysOfWeek: selectedDays,
                    createdAt: Date.now()
                });
                
                templateId = newTemplateRef.key; // Store the new template ID
                
                questTemplates.push({
                    id: newTemplateRef.key,
                    title,
                    category,
                    daysOfWeek: selectedDays,
                    createdAt: Date.now()
                });
            }
            
            const today = getTodayDayOfWeek();
            const todayDate = getTodayDate();
            if (selectedDays.includes(today) && !editId) {
                const newQuestRef = db.ref(`dailyQuests/${currentUser.uid}/${todayDate}`).push();
                await newQuestRef.set({
                    templateId: templateId, // Use stored template ID
                    title,
                    category,
                    status: 'pending',
                    createdAt: Date.now(),
                    completedAt: null,
                    verifiedAt: null
                });
                
                todayQuests.push({
                    id: newQuestRef.key,
                    templateId: templateId, // Use stored template ID
                    title,
                    category,
                    status: 'pending',
                    createdAt: Date.now()
                });
            }
        }
        
        closeAddQuestModal();
        renderTodayQuests();
        renderPersistentQuests();
        renderTemplates();
        updateProgress();
        await renderWeekSummary(); // Update week summary
        showToast(editId ? 'Quest dikemas kini' : 'Quest ditambah');
    } catch (error) {
        console.error('Save quest error:', error);
        showToast('Ralat: ' + (error.message || 'Tidak dapat menyimpan quest'));
    }
}

async function editTemplate(templateId) {
    const template = questTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    document.getElementById('modalTitle').textContent = 'Edit Quest';
    document.getElementById('questTitleInput').value = template.title;
    document.getElementById('questCategorySelect').value = template.category;
    document.getElementById('editTemplateId').value = templateId;
    
    setQuestType('daily');
    
    document.querySelectorAll('.day-checkbox input').forEach(input => {
        input.checked = template.daysOfWeek.includes(parseInt(input.value));
    });
    
    document.getElementById('addQuestModal').classList.add('active');
}

async function deleteTemplate(templateId) {
    if (!confirm('Adakah anda pasti mahu memadam template ini? Semua quest yang berkaitan akan dipadam.')) return;
    
    try {
        // Delete the template
        await db.ref(`questTemplates/${currentUser.uid}/${templateId}`).remove();
        questTemplates = questTemplates.filter(t => t.id !== templateId);
        
        // Delete all daily quests associated with this template
        const today = getTodayDate();
        const dailyQuestsRef = db.ref(`dailyQuests/${currentUser.uid}/${today}`);
        const snapshot = await dailyQuestsRef.once('value');
        
        if (snapshot.exists()) {
            const updates = {};
            snapshot.forEach((child) => {
                const quest = child.val();
                if (quest.templateId === templateId) {
                    updates[child.key] = null; // Mark for deletion
                    // Remove from local array too
                    todayQuests = todayQuests.filter(q => q.id !== child.key);
                }
            });
            
            // Apply deletions
            if (Object.keys(updates).length > 0) {
                await dailyQuestsRef.update(updates);
            }
        }
        
        renderTemplates();
        renderTodayQuests();
        updateProgress();
        await renderWeekSummary();
        showToast('Template dan quest berkaitan dipadam');
    } catch (error) {
        console.error('Delete template error:', error);
        showToast('Ralat memadam template');
    }
}

async function deletePersistentQuest(questId) {
    if (!confirm('Adakah anda pasti mahu memadam quest ini?')) return;
    
    try {
        await db.ref(`persistentQuests/${currentUser.uid}/${questId}`).remove();
        persistentQuests = persistentQuests.filter(q => q.id !== questId);
        renderPersistentQuests();
        renderTemplates();
        showToast('Quest dipadam');
    } catch (error) {
        console.error('Delete persistent quest error:', error);
        showToast('Ralat memadam quest');
    }
}

// ===== SETTINGS FUNCTIONS =====
function showIdLoginModal() {
    document.getElementById('idLoginModal').classList.add('active');
}

function closeIdLoginModal() {
    document.getElementById('idLoginModal').classList.remove('active');
}

function showChangePinModal() {
    document.getElementById('changePinModal').classList.add('active');
}

function closeChangePinModal() {
    document.getElementById('changePinModal').classList.remove('active');
}

async function changePin() {
    const oldPin = document.getElementById('oldPinInput').value;
    const newPin = document.getElementById('newChangePinInput').value;
    const confirmPin = document.getElementById('confirmChangePinInput').value;
    
    if (oldPin !== userProfile.pin) {
        showToast('PIN lama tidak tepat');
        return;
    }
    
    if (!newPin || newPin.length !== 4) {
        showToast('PIN baru mestilah 4 digit');
        return;
    }
    
    if (newPin !== confirmPin) {
        showToast('PIN baru tidak sepadan');
        return;
    }
    
    try {
        await db.ref(`users/${currentUser.uid}`).update({ pin: newPin });
        userProfile.pin = newPin;
        
        const savedCreds = JSON.parse(localStorage.getItem('dailyquest_creds'));
        localStorage.setItem('dailyquest_creds', JSON.stringify({
            ...savedCreds,
            pin: newPin
        }));
        
        closeChangePinModal();
        showToast('PIN berjaya ditukar');
        
        document.getElementById('oldPinInput').value = '';
        document.getElementById('newChangePinInput').value = '';
        document.getElementById('confirmChangePinInput').value = '';
    } catch (error) {
        console.error('Change PIN error:', error);
        showToast('Ralat menukar PIN');
    }
}

function copyIdCode() {
    const idCode = userProfile.idCode;
    navigator.clipboard.writeText(idCode).then(() => {
        showToast('ID Code disalin');
    }).catch(() => {
        showToast('Ralat menyalin ID Code');
    });
}

// ===== TAB NAVIGATION =====
function switchTab(tabName) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    
    const tabMap = {
        quest: 'questTab',
        urus: 'urusTab',
        sejarah: 'sejarahTab',
        lagi: 'lagiTab'
    };
    
    document.getElementById(tabMap[tabName]).classList.add('active');
    
    const titleMap = {
        quest: 'Quest',
        urus: 'Urus Quest',
        sejarah: 'Sejarah',
        lagi: 'Tetapan'
    };
    
    document.getElementById('headerTitle').textContent = titleMap[tabName];
    
    document.getElementById('fabBtn').style.display = 
        (tabName === 'quest' || tabName === 'urus') ? 'flex' : 'none';
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
    // Login buttons
    document.getElementById('googleLoginBtn').addEventListener('click', loginWithGoogle);
    document.getElementById('showIdLoginBtn').addEventListener('click', showIdLoginModal);
    document.getElementById('idLoginSubmitBtn').addEventListener('click', () => {
        const idCode = document.getElementById('idCodeInput').value.trim();
        const pin = document.getElementById('pinInput').value;
        if (idCode && pin) {
            loginWithIdCode(idCode, pin);
        }
    });
    
    // PIN setup
    document.getElementById('pinSetupSubmitBtn').addEventListener('click', setupPin);
    
    // Quest type toggle
    document.getElementById('dailyTypeBtn').addEventListener('click', () => setQuestType('daily'));
    document.getElementById('persistentTypeBtn').addEventListener('click', () => setQuestType('persistent'));
    
    // Category change - toggle grocery items section
    document.getElementById('questCategorySelect').addEventListener('change', updateGrocerySection);
    
    // Save quest
    document.getElementById('saveQuestBtn').addEventListener('click', saveQuest);
    
    // FAB
    document.getElementById('fabBtn').addEventListener('click', openAddQuestModal);
    
    // Settings
    document.getElementById('changePinBtn').addEventListener('click', showChangePinModal);
    document.getElementById('changePinSubmitBtn').addEventListener('click', changePin);
    document.getElementById('copyIdBtn').addEventListener('click', copyIdCode);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Tab navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            switchTab(item.dataset.tab);
        });
    });
    
    // Close modals when clicking backdrop
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // Check auth state
    checkAuthState();
});
