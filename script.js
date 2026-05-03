// --- FIREBASE DO DEASBANK ---
// Esta configuração fica no script.js, não no firestory.rules.
const firebaseConfig = {
    apiKey: "AIzaSyDHJNJzWu-_L4cWJ4jtPYKRrPu4gkdXjno",
    authDomain: "deasbank.firebaseapp.com",
    projectId: "deasbank",
    storageBucket: "deasbank.firebasestorage.app",
    messagingSenderId: "225151516543",
    appId: "1:225151516543:web:4278a1a2e1f62ede81a44a",
    measurementId: "G-NFW52JEWNS"
};

let deasBankDb = null;
let deasBankAuth = null;

try {
    firebase.initializeApp(firebaseConfig);
    deasBankAuth = firebase.auth();
    deasBankDb = firebase.firestore();
} catch (error) {
    console.error("Erro ao iniciar Firebase do DeasBank:", error);
}

// --- ESTRUTURA DE DADOS ---
const ClientRegistry = {
    storage: {},
    insert(cpf, data) { this.storage[cpf] = data; },
    get(cpf) { return this.storage[cpf]; }
};

let currentUserCpf = null;
let currentUserUid = null;

// --- HELPERS ---
function cleanCpf(cpf) {
    return String(cpf || '').replace(/\D/g, '');
}

function formatCpf(cpf) {
    const c = cleanCpf(cpf);
    if (c.length !== 11) return cpf;
    return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function defaultUserData(name, email, cpf) {
    return {
        nome: name,
        email,
        cpf: cleanCpf(cpf),
        scoreOriginal: Math.floor(Math.random() * 400) + 500,
        score: 0,
        dividas: [
            { empresa: "Energia S/A", vencimento: "2026-05-10", valor: 150.00, peso: 1.2 },
            { empresa: "Net Plus", vencimento: "2026-05-15", valor: 100.00, peso: 1.0 }
        ],
        limite: 1500.00,
        createdAtText: new Date().toISOString()
    };
}

async function saveUserToFirestore(uid, data) {
    if (!deasBankDb || !uid) return;
    const safeData = { ...data };
    delete safeData.senha;
    await deasBankDb.collection('users').doc(uid).set({
        ...safeData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

async function loadUserFromFirestore(uid) {
    if (!deasBankDb || !uid) return null;
    const doc = await deasBankDb.collection('users').doc(uid).get();
    return doc.exists ? doc.data() : null;
}

async function persistCurrentUser() {
    if (!currentUserUid || !currentUserCpf) return;
    const user = ClientRegistry.get(currentUserCpf);
    if (user) {
        await saveUserToFirestore(currentUserUid, user).catch(console.error);
    }
}

// --- RECURSIVIDADE ---
function sumDebts(debts, index = 0) {
    if (index >= debts.length) return 0;
    return Number(debts[index].valor || 0) + sumDebts(debts, index + 1);
}

// --- NAVEGAÇÃO & MODAL ---
function showLogin() {
    document.getElementById('registerBox').classList.add('hidden');
    document.getElementById('loginBox').classList.remove('hidden');
}
function showRegister() {
    document.getElementById('loginBox').classList.add('hidden');
    document.getElementById('registerBox').classList.remove('hidden');
}
function showLgpdModal() { document.getElementById('lgpdModal').classList.remove('hidden'); }
function closeLgpdModal() { document.getElementById('lgpdModal').classList.add('hidden'); }
async function logout() {
    try {
        if (deasBankAuth) await deasBankAuth.signOut();
    } catch (e) {
        console.warn(e);
    }
    location.reload();
}

// --- CADASTRO COM CPF + E-MAIL ---
// O CPF fica salvo no Firestore. O login é feito por e-mail e senha.
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!deasBankAuth || !deasBankDb) {
        alert("Firebase não iniciou. Confira se Authentication e Firestore estão ativos.");
        return;
    }

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const cpf = cleanCpf(document.getElementById('regCpf').value);
    const password = document.getElementById('regPassword').value;

    if (!name || !email || !cpf || !password) {
        alert("Preencha todos os campos.");
        return;
    }

    if (cpf.length !== 11) {
        alert("Digite um CPF válido com 11 números.");
        return;
    }

    try {
        const cred = await deasBankAuth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });

        const data = defaultUserData(name, email, cpf);
        data.uid = cred.user.uid;

        ClientRegistry.insert(cpf, { ...data, senha: password });
        await saveUserToFirestore(cred.user.uid, data);

        alert("Cadastro realizado e salvo no Firebase!");
        showLogin();
    } catch (error) {
        alert("Erro ao cadastrar: " + error.message);
    }
});

// --- LOGIN POR E-MAIL ---
document.getElementById('loginForm').addEventListener('submit', async function(e){
    e.preventDefault();

    if (!deasBankAuth || !deasBankDb) {
        alert("Firebase não iniciou. Confira se Authentication e Firestore estão ativos.");
        return;
    }

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    try {
        const cred = await deasBankAuth.signInWithEmailAndPassword(email, password);
        const uid = cred.user.uid;
        const profile = await loadUserFromFirestore(uid);

        if (!profile) {
            const fallback = defaultUserData(cred.user.displayName || "Cliente DeasBank", email, "00000000000");
            fallback.uid = uid;
            await saveUserToFirestore(uid, fallback);
            ClientRegistry.insert(fallback.cpf, { ...fallback, senha: password });
            currentUserCpf = fallback.cpf;
        } else {
            const cpf = cleanCpf(profile.cpf || "00000000000");
            ClientRegistry.insert(cpf, { ...profile, senha: password });
            currentUserCpf = cpf;
        }

        currentUserUid = uid;
        renderDashboard(ClientRegistry.get(currentUserCpf));
    } catch (error) {
        alert("Erro no login: " + error.message);
    }
});

// --- LÓGICA DE PESOS E REGRAS ---
function calculateWeightedScore(user) {
    const PESO_POR_PENDENCIA = 30;
    const PESO_VALOR_DIVIDA = 0.05;
    const PENALIDADE_INTERNA = 1.5;

    let deducaoTotal = 0;

    user.dividas.forEach(divida => {
        let multiplicador = divida.empresa === "DEASBank" ? PENALIDADE_INTERNA : 1.0;
        deducaoTotal += (PESO_POR_PENDENCIA + (Number(divida.valor || 0) * PESO_VALOR_DIVIDA)) * multiplicador;
    });

    const novoScore = Number(user.scoreOriginal || 500) - deducaoTotal;
    return Math.max(0, Math.floor(novoScore));
}

// --- ATUALIZAÇÃO DE INTERFACE ---
function renderDashboard(user) {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('clientNameDisplay').innerText = user.nome;

    user.score = calculateWeightedScore(user);

    const scoreCircle = document.getElementById('scoreCircle');
    const scoreNumber = document.getElementById('scoreNumber');
    const scoreFeedback = document.getElementById('scoreFeedback');
    const scorePct = (user.score / 1000) * 100;

    scoreCircle.style.strokeDasharray = `${scorePct}, 100`;
    scoreNumber.textContent = user.score;

    if (user.score < 400) {
        scoreCircle.setAttribute('class', 'circle stroke-low');
        scoreNumber.setAttribute('class', 'percentage text-low');
        scoreFeedback.innerText = "Atenção: Score Baixo";
    } else if (user.score < 700) {
        scoreCircle.setAttribute('class', 'circle stroke-med');
        scoreNumber.setAttribute('class', 'percentage text-med');
        scoreFeedback.innerText = "Seu score é Regular";
    } else {
        scoreCircle.setAttribute('class', 'circle stroke-high');
        scoreNumber.setAttribute('class', 'percentage text-high');
        scoreFeedback.innerText = "Excelente saúde financeira!";
    }

    renderDebtTable(user);
    updateInvestmentsUI();
    persistCurrentUser();
}

function renderDebtTable(user) {
    const tbody = document.getElementById('debtTableBody');
    tbody.innerHTML = user.dividas.map((d, index) => `
        <tr>
            <td><strong>${d.empresa}</strong></td>
            <td>${d.vencimento}</td>
            <td>R$ ${Number(d.valor || 0).toFixed(2)}</td>
            <td><span class="status-badge">Pendente</span></td>
            <td><button class="btn-action" onclick="payDebt(${index})">Pagar</button></td>
        </tr>
    `).join('');

    const total = sumDebts(user.dividas);
    document.getElementById('totalDebtAmount').innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('debtCount').innerText = `${user.dividas.length} pendências ativas`;
    document.getElementById('loanLimit').innerText = `R$ ${Number(user.limite || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

// --- REGRAS DE CONCESSÃO ---
function requestLimitIncrease() {
    const user = ClientRegistry.get(currentUserCpf);
    const totalDividas = sumDebts(user.dividas);

    if (totalDividas > (Number(user.limite || 0) * 0.2)) {
        alert("Aumento Negado: Comprometimento financeiro muito alto.");
        return;
    }

    if (user.score >= 750) {
        user.limite += 1000;
        alert("Aumento de R$ 1.000,00 aprovado!");
    } else if (user.score >= 500) {
        user.limite += 300;
        alert("Aumento parcial de R$ 300,00 aprovado!");
    } else {
        alert("Aumento negado por baixo Score.");
    }

    renderDashboard(user);
}

function takeLoan() {
    const user = ClientRegistry.get(currentUserCpf);
    const LIMITE_MAXIMO = 5000.00;
    const totalContratado = user.dividas.filter(d => d.empresa === "DEASBank").reduce((a, b) => a + Number(b.valor || 0), 0);

    if (user.score < 450) {
        alert("Empréstimo negado: Risco de crédito elevado para o seu perfil atual.");
        return;
    }

    if (totalContratado + 1000 <= LIMITE_MAXIMO) {
        const dataVenc = new Date();
        dataVenc.setDate(dataVenc.getDate() + 30);

        user.dividas.push({
            empresa: "DEASBank",
            vencimento: dataVenc.toISOString().split('T')[0],
            valor: 1000.00
        });

        renderDashboard(user);
        alert("Empréstimo liberado com sucesso!");
    } else {
        alert("Você atingiu o limite máximo de contratos com o banco.");
    }
}

function payDebt(index) {
    const user = ClientRegistry.get(currentUserCpf);
    const divida = user.dividas[index];

    if (user.limite < divida.valor) {
        alert("Saldo insuficiente no Limite Disponível para quitar esta dívida.");
        return;
    }

    if (confirm(`Confirmar pagamento de R$ ${Number(divida.valor || 0).toFixed(2)} utilizando seu limite?`)) {
        user.limite -= divida.valor;
        user.dividas.splice(index, 1);
        renderDashboard(user);
        alert("Pagamento processado! O valor foi descontado do seu limite e seu Score será recalculado.");
    }
}

function switchTab(tabName) {
    const dash = document.getElementById('mainDashboard');
    const inv = document.getElementById('investmentsSection');
    const openFinance = document.getElementById('openFinanceSection');
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => item.classList.remove('active'));

    if (dash) dash.classList.add('hidden');
    if (inv) inv.classList.add('hidden');
    if (openFinance) openFinance.classList.add('hidden');

    if (tabName === 'dashboard') {
        if (dash) dash.classList.remove('hidden');
        if (navItems[0]) navItems[0].classList.add('active');
        return;
    }

    if (tabName === 'investimentos') {
        if (inv) inv.classList.remove('hidden');
        if (navItems[1]) navItems[1].classList.add('active');
        updateInvestmentsUI();
        return;
    }

    if (tabName === 'open finance' || tabName === 'openFinance') {
        if (openFinance) openFinance.classList.remove('hidden');
        if (navItems[2]) navItems[2].classList.add('active');
        loadOpenFinanceRequests();
        return;
    }
}

function updateInvestmentsUI() {
    const user = ClientRegistry.get(currentUserCpf);
    if (!user) return;

    const totalContratado = user.dividas
        .filter(d => d.empresa === "DEASBank")
        .reduce((a, b) => a + Number(b.valor || 0), 0);

    const elTotal = document.getElementById('totalTakenLoans');
    const elAvailable = document.getElementById('availableCredit');

    if (elTotal) {
        elTotal.innerText = `R$ ${totalContratado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    }
    if (elAvailable) {
        elAvailable.innerText = `R$ ${(5000 - totalContratado).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    }
}

// --- OPEN FINANCE: RECEBER PEDIDOS DO DEAS FINANCE ---
function formatOpenFinanceMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function escapeOpenFinanceText(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function openFinanceStatusLabel(status) {
    if (status === 'connection_approved') return 'Conexão aceita';
    if (status === 'connection_denied') return 'Conexão recusada';
    if (status === 'data_approved') return 'Dados aceitos';
    if (status === 'data_denied') return 'Dados recusados';
    if (status === 'data_pending') return 'Aguardando dados';
    if (status === 'approved') return 'Aceito';
    if (status === 'denied') return 'Recusado';
    return 'Aguardando aceite';
}

function openFinanceStatusClass(status) {
    if (status === 'connection_approved' || status === 'data_approved' || status === 'approved') return 'approved';
    if (status === 'connection_denied' || status === 'data_denied' || status === 'denied') return 'denied';
    return 'pending';
}

function requestTypeLabel(request) {
    if (request.requestType === 'connection_request') return 'Conexão Open Finance';
    if (request.requestType === 'data_transfer_request') return 'Transferência de renda e dados';
    if (request.requestType === 'income_balance_debts_limit_transfer') return 'Transferência de renda e dados';
    return request.purpose || 'Solicitação Open Finance';
}

function updateOpenFinanceCounters(requests) {
    const total = requests.length;
    const pending = requests.filter(r => !r.status || ['pending','connection_pending','data_pending'].includes(r.status)).length;
    const approved = requests.filter(r => ['approved','connection_approved','data_approved'].includes(r.status)).length;

    const totalEl = document.getElementById('ofTotalRequests');
    const pendingEl = document.getElementById('ofPendingRequests');
    const approvedEl = document.getElementById('ofApprovedRequests');

    if (totalEl) totalEl.innerText = total;
    if (pendingEl) pendingEl.innerText = pending;
    if (approvedEl) approvedEl.innerText = approved;
}

async function loadOpenFinanceRequests() {
    const container = document.getElementById('openFinanceCards');
    if (!container) return;

    if (!deasBankDb) {
        container.innerHTML = '<div class="of-empty-state">Firebase do DeasBank não iniciou. Confira o script.js e as regras do Firestore.</div>';
        return;
    }

    container.innerHTML = '<div class="of-empty-state">Carregando solicitações...</div>';

    try {
        const snapshot = await deasBankDb.collection('openFinanceRequests').get();
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        requests.sort((a, b) => String(b.createdAtText || b.createdAt || '').localeCompare(String(a.createdAtText || a.createdAt || '')));
        updateOpenFinanceCounters(requests);

        if (!requests.length) {
            container.innerHTML = '<div class="of-empty-state">Nenhuma solicitação Open Finance recebida ainda. Quando o Deas Finance conectar ao DeasBank, o pedido aparecerá aqui.</div>';
            return;
        }

        container.innerHTML = requests.map(request => {
            const status = request.status || 'connection_pending';
            const canAnalyze = !['approved','denied','connection_approved','connection_denied','data_approved','data_denied'].includes(status);
            const isDataRequest = request.requestType === 'data_transfer_request' || request.requestType === 'income_balance_debts_limit_transfer';
            const requested = request.requestedData || {};

            return `
                <article class="of-request-card">
                    <div class="of-request-top">
                        <div>
                            <span class="of-source">${escapeOpenFinanceText(request.sourceBank || 'Deas Finance')}</span>
                            <h3>${escapeOpenFinanceText(request.userName || 'Cliente')}</h3>
                            <p>${escapeOpenFinanceText(request.emailMasked || 'e-mail protegido')}</p>
                        </div>
                        <span class="of-status ${openFinanceStatusClass(status)}">${openFinanceStatusLabel(status)}</span>
                    </div>

                    <div class="of-consent-line">
                        <strong>Tipo:</strong> ${escapeOpenFinanceText(requestTypeLabel(request))}
                    </div>

                    ${isDataRequest ? `
                        <div class="of-data-grid">
                            <div><small>Salário/renda solicitado</small><strong>${formatOpenFinanceMoney(request.importedSalary || requested.importedSalary)}</strong></div>
                            <div><small>Saldo DeasBank</small><strong>${formatOpenFinanceMoney(request.externalBalance || requested.externalBalance)}</strong></div>
                            <div><small>Dívidas DeasBank</small><strong>${formatOpenFinanceMoney(request.externalDebt || requested.externalDebt)}</strong></div>
                            <div><small>Limite DeasBank</small><strong>${formatOpenFinanceMoney(request.externalLimit || requested.externalLimit)}</strong></div>
                        </div>
                    ` : `
                        <div class="of-data-grid">
                            <div><small>Finalidade</small><strong>Conectar contas</strong></div>
                            <div><small>Titularidade</small><strong>Mesma pessoa</strong></div>
                            <div><small>Dados financeiros</small><strong>Não enviados ainda</strong></div>
                            <div><small>Senha</small><strong>Nunca compartilhada</strong></div>
                        </div>
                    `}

                    <div class="of-consent-line">
                        <strong>Resumo:</strong> ${escapeOpenFinanceText(request.relationshipSummary || request.purpose || 'Solicitação pendente de aceite.')}
                    </div>

                    ${status === 'connection_approved' ? `<div class="of-result approved">Conexão aceita pelo DeasBank.</div>` : ''}
                    ${status === 'data_approved' ? `<div class="of-result approved">Transferência de renda/dados aceita pelo DeasBank.</div>` : ''}
                    ${status === 'connection_denied' ? `<div class="of-result denied">Conexão recusada pelo DeasBank.</div>` : ''}
                    ${status === 'data_denied' ? `<div class="of-result denied">Transferência de renda/dados recusada pelo DeasBank.</div>` : ''}

                    <div class="of-actions">
                        ${canAnalyze ? `
                            <button class="btn-action of-approve" onclick="approveOpenFinanceRequest('${request.id}', '${escapeOpenFinanceText(request.requestType || '')}')">${isDataRequest ? 'Aceitar transferência' : 'Aceitar conexão'}</button>
                            <button class="btn-action of-deny" onclick="denyOpenFinanceRequest('${request.id}', '${escapeOpenFinanceText(request.requestType || '')}')">${isDataRequest ? 'Recusar transferência' : 'Recusar conexão'}</button>
                        ` : `<small>${escapeOpenFinanceText(request.analysisMessage || 'Solicitação analisada')}</small>`}
                    </div>
                </article>
            `;
        }).join('');
    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="of-empty-state">Erro ao carregar solicitações: ${escapeOpenFinanceText(error.message)}</div>`;
    }
}

async function approveOpenFinanceRequest(requestId, requestType = '') {
    if (!deasBankDb) return alert('Firebase não iniciou.');

    const isDataRequest = requestType === 'data_transfer_request' || requestType === 'income_balance_debts_limit_transfer';
    const status = isDataRequest ? 'data_approved' : 'connection_approved';
    const message = isDataRequest
        ? 'Transferência de renda/dados aceita pelo DEASBank.'
        : 'Conexão Open Finance aceita pelo DEASBank.';

    try {
        await deasBankDb.collection('openFinanceRequests').doc(requestId).update({
            status,
            analysisMessage: message,
            acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
            analyzedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert(isDataRequest ? 'Transferência aceita com sucesso.' : 'Conexão aceita com sucesso.');
        loadOpenFinanceRequests();
    } catch (error) {
        alert('Erro ao aceitar: ' + error.message);
    }
}

async function denyOpenFinanceRequest(requestId, requestType = '') {
    if (!deasBankDb) return alert('Firebase não iniciou.');

    const isDataRequest = requestType === 'data_transfer_request' || requestType === 'income_balance_debts_limit_transfer';
    const status = isDataRequest ? 'data_denied' : 'connection_denied';
    const message = isDataRequest
        ? 'Transferência de renda/dados recusada pelo DEASBank.'
        : 'Conexão Open Finance recusada pelo DEASBank.';

    try {
        await deasBankDb.collection('openFinanceRequests').doc(requestId).update({
            status,
            approvedAmount: 0,
            analysisMessage: message,
            deniedAt: firebase.firestore.FieldValue.serverTimestamp(),
            analyzedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert(isDataRequest ? 'Transferência recusada pelo DEASBank.' : 'Conexão recusada pelo DEASBank.');
        loadOpenFinanceRequests();
    } catch (error) {
        alert('Erro ao recusar: ' + error.message);
    }
}
