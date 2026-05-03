// --- FIREBASE DO DEASBANK ---
// Cadastro: nome, e-mail e senha.
// Login: e-mail e senha.
// CPF removido para evitar conflito.

const deasFinanceConfig = {
    apiKey: "AIzaSyCCfx1qpBgVkIyOfIX05QqMFmsY_7L7q-M",
    authDomain: "deas-finance.firebaseapp.com",
    projectId: "deas-finance",
    storageBucket: "deas-finance.firebasestorage.app",
    messagingSenderId: "386259692909",
    appId: "1:386259692909:web:2e5f35df5effde647b3e64",
    measurementId: "G-7TPPZ8RKW1"
};

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
let deasFinanceDb = null;

try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    deasBankDb = firebase.firestore();
    deasBankAuth = firebase.auth();

    const financeApp = firebase.apps.find(app => app.name === "deasFinancePartner") || firebase.initializeApp(deasFinanceConfig, "deasFinancePartner");
    deasFinanceDb = financeApp.firestore();
} catch (error) {
    console.error("Erro ao iniciar Firebase do DeasBank:", error);
}

const ClientRegistry = {
    storage: {},
    insert(id, data) {
        this.storage[id] = data;
    },
    get(id) {
        return this.storage[id];
    }
};

let currentUserId = null;
let currentUserCpf = null; // compatibilidade com funções antigas; agora guarda o UID.
let openFinanceListMode = "pending";
function ofHiddenKeyBank(){ return "deasbank_openfinance_hidden_" + (currentUserId || "anon"); }
function ofGetHiddenBank(){ try { return JSON.parse(localStorage.getItem(ofHiddenKeyBank()) || "[]"); } catch(_) { return []; } }
function ofSetHiddenBank(ids){ localStorage.setItem(ofHiddenKeyBank(), JSON.stringify([...new Set([...(ofGetHiddenBank()), ...ids.filter(Boolean)])])); }

function moneyBR(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function sumDebts(debts, index = 0) {
    if (!Array.isArray(debts)) return 0;
    if (index >= debts.length) return 0;

    return Number(debts[index].valor || 0) + sumDebts(debts, index + 1);
}

function buildDefaultUser({ uid, name, email }) {
    return {
        uid,
        nome: name,
        email,
        scoreOriginal: Math.floor(Math.random() * 400) + 500,
        score: 0,
        dividas: [
            { empresa: "Energia S/A", vencimento: "2026-05-10", valor: 150.00, peso: 1.2 },
            { empresa: "Net Plus", vencimento: "2026-05-15", valor: 100.00, peso: 1.0 }
        ],
        limite: 1500.00,
        saldo: 5200.00,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
}

async function saveUserToFirestore(uid, userData) {
    if (!deasBankDb) throw new Error("Firestore não iniciou.");

    await deasBankDb.collection("users").doc(uid).set(userData, { merge: true });
}

async function loadUserFromFirestore(uid) {
    if (!deasBankDb) throw new Error("Firestore não iniciou.");

    const snap = await deasBankDb.collection("users").doc(uid).get();

    if (!snap.exists) return null;

    return { uid, ...snap.data() };
}

async function persistCurrentUser() {
    if (!currentUserId || !deasBankDb) return;

    const user = ClientRegistry.get(currentUserId);

    if (!user) return;

    await deasBankDb.collection("users").doc(currentUserId).set({
        ...user,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

// --- NAVEGAÇÃO & MODAL ---
function showLogin() {
    document.getElementById("registerBox").classList.add("hidden");
    document.getElementById("loginBox").classList.remove("hidden");
}

function showRegister() {
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("registerBox").classList.remove("hidden");
}

function showLgpdModal() {
    document.getElementById("lgpdModal").classList.remove("hidden");
}

function closeLgpdModal() {
    document.getElementById("lgpdModal").classList.add("hidden");
}

async function logout() {
    try {
        if (deasBankAuth) {
            await deasBankAuth.signOut();
        }
    } catch (error) {
        console.error(error);
    }

    currentUserId = null;
    currentUserCpf = null;
    location.reload();
}

// --- CADASTRO SEM CPF ---
document.getElementById("registerForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    if (!deasBankAuth || !deasBankDb) {
        alert("Firebase não iniciou. Confira as configurações e as regras.");
        return;
    }

    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim().toLowerCase();
    const password = document.getElementById("regPassword").value;

    if (!name || !email || !password) {
        alert("Preencha nome, e-mail e senha.");
        return;
    }

    if (password.length < 6) {
        alert("A senha precisa ter pelo menos 6 caracteres.");
        return;
    }

    try {
        const credential = await deasBankAuth.createUserWithEmailAndPassword(email, password);
        const uid = credential.user.uid;

        await credential.user.updateProfile({
            displayName: name
        });

        const userData = buildDefaultUser({
            uid,
            name,
            email
        });

        await saveUserToFirestore(uid, userData);
        ClientRegistry.insert(uid, userData);

        alert("Cadastro realizado com sucesso! Agora entre usando e-mail e senha.");
        showLogin();

        const loginEmail = document.getElementById("loginEmail");
        if (loginEmail) loginEmail.value = email;
    } catch (error) {
        console.error(error);
        alert("Erro ao cadastrar: " + translateFirebaseError(error));
    }
});

// --- LOGIN POR E-MAIL ---
document.getElementById("loginForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    if (!deasBankAuth || !deasBankDb) {
        alert("Firebase não iniciou. Confira as configurações e as regras.");
        return;
    }

    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        alert("Informe e-mail e senha.");
        return;
    }

    try {
        const credential = await deasBankAuth.signInWithEmailAndPassword(email, password);
        const uid = credential.user.uid;

        let user = await loadUserFromFirestore(uid);

        if (!user) {
            user = buildDefaultUser({
                uid,
                name: credential.user.displayName || "Cliente DeasBank",
                email: credential.user.email
            });

            await saveUserToFirestore(uid, user);
        }

        ClientRegistry.insert(uid, user);
        currentUserId = uid;
        currentUserCpf = uid;
        renderDashboard(user);
    } catch (error) {
        console.error(error);
        alert("Erro ao entrar: " + translateFirebaseError(error));
    }
});

function translateFirebaseError(error) {
    const code = error && error.code ? error.code : "";

    if (code.includes("email-already-in-use")) return "este e-mail já está cadastrado.";
    if (code.includes("invalid-email")) return "e-mail inválido.";
    if (code.includes("weak-password")) return "a senha precisa ter pelo menos 6 caracteres.";
    if (code.includes("user-not-found")) return "usuário não encontrado.";
    if (code.includes("wrong-password")) return "senha incorreta.";
    if (code.includes("invalid-credential")) return "e-mail ou senha incorretos.";
    if (code.includes("network-request-failed")) return "falha de conexão.";

    return error.message || "erro desconhecido.";
}

// Mantém sessão se atualizar a página.
if (typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().onAuthStateChanged(async (authUser) => {
        if (!authUser || currentUserId) return;

        try {
            const user = await loadUserFromFirestore(authUser.uid);

            if (user) {
                ClientRegistry.insert(authUser.uid, user);
                currentUserId = authUser.uid;
                currentUserCpf = authUser.uid;
                renderDashboard(user);
            }
        } catch (error) {
            console.error(error);
        }
    });
}

// --- SCORE ---
function calculateWeightedScore(user) {
    const PESO_POR_PENDENCIA = 30;
    const PESO_VALOR_DIVIDA = 0.05;
    const PENALIDADE_INTERNA = 1.5;

    let deducaoTotal = 0;

    (user.dividas || []).forEach(divida => {
        let multiplicador = divida.empresa === "DEASBank" ? PENALIDADE_INTERNA : 1.0;
        deducaoTotal += (PESO_POR_PENDENCIA + (Number(divida.valor || 0) * PESO_VALOR_DIVIDA)) * multiplicador;
    });

    const novoScore = Number(user.scoreOriginal || 500) - deducaoTotal;

    return Math.max(0, Math.floor(novoScore));
}

function renderDashboard(user) {
    document.getElementById("authSection").classList.add("hidden");
    document.getElementById("dashboardSection").classList.remove("hidden");
    document.getElementById("clientNameDisplay").innerText = user.nome || "Cliente";

    user.score = calculateWeightedScore(user);

    const scoreCircle = document.getElementById("scoreCircle");
    const scoreNumber = document.getElementById("scoreNumber");
    const scoreFeedback = document.getElementById("scoreFeedback");
    const scorePct = (user.score / 1000) * 100;

    scoreCircle.style.strokeDasharray = `${scorePct}, 100`;
    scoreNumber.textContent = user.score;

    if (user.score < 400) {
        scoreCircle.setAttribute("class", "circle stroke-low");
        scoreNumber.setAttribute("class", "percentage text-low");
        scoreFeedback.innerText = "Atenção: Score Baixo";
    } else if (user.score < 700) {
        scoreCircle.setAttribute("class", "circle stroke-med");
        scoreNumber.setAttribute("class", "percentage text-med");
        scoreFeedback.innerText = "Seu score é Regular";
    } else {
        scoreCircle.setAttribute("class", "circle stroke-high");
        scoreNumber.setAttribute("class", "percentage text-high");
        scoreFeedback.innerText = "Excelente saúde financeira!";
    }

    const balanceEl = document.getElementById("currentBalanceAmount");
    if (balanceEl) balanceEl.innerText = `R$ ${moneyBR(user.saldo || 0)}`;

    renderDebtTable(user);
    updateInvestmentsUI();
}

function renderDebtTable(user) {
    const tbody = document.getElementById("debtTableBody");
    const dividas = user.dividas || [];

    tbody.innerHTML = dividas.map((d, index) => `
        <tr>
            <td><strong>${d.empresa}</strong></td>
            <td>${d.vencimento}</td>
            <td>R$ ${moneyBR(d.valor)}</td>
            <td><span class="status-badge">Pendente</span></td>
            <td><button class="btn-action" onclick="payDebt(${index})">Pagar</button></td>
        </tr>
    `).join("");

    const total = sumDebts(dividas);
    document.getElementById("totalDebtAmount").innerText = `R$ ${moneyBR(total)}`;
    document.getElementById("debtCount").innerText = `${dividas.length} pendências ativas`;
    document.getElementById("loanLimit").innerText = `R$ ${moneyBR(user.limite)}`;
}

async function requestLimitIncrease() {
    const user = ClientRegistry.get(currentUserId);
    const totalDividas = sumDebts(user.dividas);

    if (totalDividas > (user.limite * 0.2)) {
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
    await persistCurrentUser();
}

async function takeLoan() {
    const user = ClientRegistry.get(currentUserId);
    const LIMITE_MAXIMO = 5000.00;
    const totalContratado = (user.dividas || [])
        .filter(d => d.empresa === "DEASBank")
        .reduce((a, b) => a + Number(b.valor || 0), 0);

    if (user.score < 450) {
        alert("Empréstimo negado: Risco de crédito elevado para o seu perfil atual.");
        return;
    }

    if (totalContratado + 1000 <= LIMITE_MAXIMO) {
        const dataVenc = new Date();
        dataVenc.setDate(dataVenc.getDate() + 30);

        user.dividas.push({
            empresa: "DEASBank",
            vencimento: dataVenc.toISOString().split("T")[0],
            valor: 1000.00
        });

        renderDashboard(user);
        await persistCurrentUser();
        alert("Empréstimo liberado com sucesso!");
    } else {
        alert("Você atingiu o limite máximo de contratos com o banco.");
    }
}

async function payDebt(index) {
    const user = ClientRegistry.get(currentUserId);
    const divida = user.dividas[index];

    if (user.limite < divida.valor) {
        alert("Saldo insuficiente no Limite Disponível para quitar esta dívida.");
        return;
    }

    if (confirm(`Confirmar pagamento de R$ ${Number(divida.valor).toFixed(2)} utilizando seu limite?`)) {
        user.limite -= divida.valor;
        user.dividas.splice(index, 1);

        renderDashboard(user);
        await persistCurrentUser();

        alert("Pagamento processado! O valor foi descontado do seu limite e seu Score será recalculado.");
    }
}

function switchTab(tabName) {
    const dash = document.getElementById("mainDashboard");
    const inv = document.getElementById("investmentsSection");
    const openFinance = document.getElementById("openFinanceSection");
    const navItems = document.querySelectorAll(".nav-item");

    navItems.forEach(item => item.classList.remove("active"));

    if (dash) dash.classList.add("hidden");
    if (inv) inv.classList.add("hidden");
    if (openFinance) openFinance.classList.add("hidden");

    if (tabName === "dashboard") {
        if (dash) dash.classList.remove("hidden");
        if (navItems[0]) navItems[0].classList.add("active");
        return;
    }

    if (tabName === "investimentos") {
        if (inv) inv.classList.remove("hidden");
        if (navItems[1]) navItems[1].classList.add("active");
        updateInvestmentsUI();
        return;
    }

    if (tabName === "open finance" || tabName === "openFinance") {
        if (openFinance) openFinance.classList.remove("hidden");
        if (navItems[2]) navItems[2].classList.add("active");
        loadOpenFinanceRequests();
    }
}

function updateInvestmentsUI() {
    const user = ClientRegistry.get(currentUserId);

    if (!user) return;

    const totalContratado = (user.dividas || [])
        .filter(d => d.empresa === "DEASBank")
        .reduce((a, b) => a + Number(b.valor || 0), 0);

    const elTotal = document.getElementById("totalTakenLoans");
    const elAvailable = document.getElementById("availableCredit");

    if (elTotal) {
        elTotal.innerText = `R$ ${moneyBR(totalContratado)}`;
    }

    if (elAvailable) {
        elAvailable.innerText = `R$ ${moneyBR(5000 - totalContratado)}`;
    }
}

// --- OPEN FINANCE ---
function formatOpenFinanceMoney(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function escapeOpenFinanceText(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function applyDeasBankBalanceDelta(amount, moveId, reason = "Open Finance") {
    const value = Number(amount || 0);
    if (!currentUserId || !deasBankDb || !value) return ClientRegistry.get(currentUserId);

    const userRef = deasBankDb.collection("users").doc(currentUserId);
    const latestSnap = await userRef.get();
    const latest = latestSnap.exists ? latestSnap.data() : (ClientRegistry.get(currentUserId) || {});
    const nextSaldo = Number(latest.saldo || 0) + value;
    const updated = {
        ...latest,
        uid: currentUserId,
        saldo: nextSaldo,
        lastOpenFinanceMoveId: moveId || latest.lastOpenFinanceMoveId || null,
        lastOpenFinanceMoveReason: reason,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await userRef.set(updated, { merge: true });
    ClientRegistry.insert(currentUserId, updated);
    renderDashboard(updated);
    return updated;
}

function renderDeasFinanceImportedData(local = {}) {
    const payload = local.sharedPayload || {};
    const status = String(local.connectionStatus || payload.status || "connection_pending");
    const badge = document.getElementById("deasFinanceConnectionBadge");
    const summary = document.getElementById("ofRelationshipSummaryBank");
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.innerText = value; };

    if (badge) badge.innerText = openFinanceStatusLabel(status);
    setText("ofImportedSalaryBank", formatOpenFinanceMoney(local.importedSalary || payload.importedSalary || payload.transferAmount || 0));
    setText("ofExternalBalanceBank", formatOpenFinanceMoney(local.externalBalance || payload.externalBalance || 0));
    setText("ofExternalDebtBank", formatOpenFinanceMoney(local.externalDebt || payload.externalDebt || 0));
    setText("ofExternalLimitBank", formatOpenFinanceMoney(local.externalLimit || payload.externalLimit || 0));
    setText("ofExternalLoansBank", formatOpenFinanceMoney(local.externalLoans || payload.loansTotal || 0));
    setText("ofExternalScoreBank", String(local.externalScore || payload.creditScore || "-"));
    if (summary) summary.innerText = local.relationshipSummary || payload.relationshipSummary || "Nenhum dado financeiro recebido ainda.";
}


function setOpenFinanceListMode(mode) {
    openFinanceListMode = mode || "pending";
    document.querySelectorAll(".of-filter").forEach(btn => btn.classList.remove("active"));
    const target = document.getElementById(mode === "all" ? "ofFilterAll" : mode === "sent" ? "ofFilterSent" : "ofFilterPending");
    if (target) target.classList.add("active");
    loadOpenFinanceRequests();
}

function isOpenFinanceFinished(status) {
    return String(status || "").includes("approved") || String(status || "").includes("denied");
}

function updateMutualDataVisibility(connectionStatus, connectionApproved = false) {
    const card = document.getElementById("requestDeasFinanceDataCard");
    if (!card) return;
    const status = String(connectionStatus || "");
    const hasApprovedConnection = connectionApproved === true || status === "connection_approved" || status === "data_approved" || status === "data_denied";
    const blocked = status === "connection_pending" || status === "connection_denied" || status === "data_pending";
    card.classList.toggle("hidden", !(hasApprovedConnection && !blocked));
}

function openFinanceStatusLabel(status) {
    if (status === "connection_approved") return "Conexão aceita";
    if (status === "connection_denied") return "Conexão recusada";
    if (status === "data_pending") return "Aguardando dados";
    if (status === "data_approved") return "Dados aceitos";
    if (status === "data_denied") return "Dados recusados";
    if (status === "consent_revoked") return "Desconectado";
    if (status === "approved") return "Aceito";
    if (status === "denied") return "Recusado";

    return "Aguardando aceite";
}

function openFinanceStatusClass(status) {
    if (status === "connection_approved" || status === "data_approved" || status === "approved") return "approved";
    if (status === "connection_denied" || status === "data_denied" || status === "denied" || status === "consent_revoked") return "denied";

    return "pending";
}

function updateOpenFinanceCounters(requests) {
    const total = requests.length;
    const pending = requests.filter(r => !String(r.status || "").includes("approved") && !String(r.status || "").includes("denied")).length;
    const approved = requests.filter(r => String(r.status || "").includes("approved")).length;

    const totalEl = document.getElementById("ofTotalRequests");
    const pendingEl = document.getElementById("ofPendingRequests");
    const approvedEl = document.getElementById("ofApprovedRequests");

    if (totalEl) totalEl.innerText = total;
    if (pendingEl) pendingEl.innerText = pending;
    if (approvedEl) approvedEl.innerText = approved;
}

function openFinancePurposeLabel(request) {
    if (request.requestType === "connection_request") return "Conexão entre contas";
    if (request.requestType === "data_transfer_request") return "Transferência de renda/dados";

    return request.purpose || "Open Finance";
}

async function loadOpenFinanceRequests() {
    const container = document.getElementById("openFinanceCards");

    if (!container) return;

    if (!deasBankDb) {
        container.innerHTML = '<div class="of-empty-state">Firebase do DeasBank não iniciou. Confira o script.js e as regras do Firestore.</div>';
        return;
    }

    container.innerHTML = '<div class="of-empty-state">Carregando solicitações...</div>';

    try {
        const snapshot = await deasBankDb.collection("openFinanceRequests").get();
        let requests = snapshot.docs.map(doc => ({ id: doc.id, partnerProject: "deasbank", direction: "recebido", ...doc.data() }));
        const hiddenLocal = ofGetHiddenBank();
        requests = requests.filter(r => !hiddenLocal.includes(r.id));
        requests = requests.filter(r => !(Array.isArray(r.hiddenForUsers) && currentUserId && r.hiddenForUsers.includes(currentUserId)));

        if (deasFinanceDb && currentUserId) {
            const localConnSnap = await deasBankDb.collection("users").doc(currentUserId).collection("openFinanceConnections").doc("deasfinance").get();
            const localConn = localConnSnap.exists ? localConnSnap.data() : null;
            updateMutualDataVisibility(localConn?.connectionStatus, localConn?.connectionApproved);
            renderDeasFinanceImportedData(localConn || {});
            const ids = [localConn?.partnerRequestId, localConn?.dataRequestId].filter(Boolean);
            for (const id of ids) {
                const partnerSnap = await deasFinanceDb.collection("openFinanceRequests").doc(id).get();
                if (partnerSnap.exists) {
                    const sentData = { id: partnerSnap.id, partnerProject: "deasfinance", direction: "enviado", ...partnerSnap.data() };
                    if (!ofGetHiddenBank().includes(sentData.id) && !(Array.isArray(sentData.hiddenForUsers) && currentUserId && sentData.hiddenForUsers.includes(currentUserId))) requests.push(sentData);
                }
            }
        }

        requests.sort((a, b) => String(b.createdAtText || b.createdAt || "").localeCompare(String(a.createdAtText || a.createdAt || "")));
        updateOpenFinanceCounters(requests);

        if (!requests.length) {
            container.innerHTML = '<div class="of-empty-state">Nenhuma solicitação Open Finance recebida ainda. Quando o Deas Finance conectar ao DeasBank, o pedido aparecerá aqui.</div>';
            return;
        }

        const visibleRequests = openFinanceListMode === "all"
            ? requests
            : openFinanceListMode === "sent"
                ? requests.filter(r => r.direction === "enviado")
                : requests.filter(r => !isOpenFinanceFinished(r.status || (r.requestType === "connection_request" ? "connection_pending" : "data_pending")) && r.direction !== "enviado");

        if (!visibleRequests.length) {
            container.innerHTML = `<div class="of-clean-summary"><strong>Área limpa</strong><span>${openFinanceListMode === "pending" ? "Nenhum pedido pendente para analisar agora." : "Nenhum item nesta visualização."}</span></div>`;
            return;
        }

        container.innerHTML = `<div class="of-clean-summary"><strong>${visibleRequests.length} item(ns) exibido(s)</strong><span>Use os filtros para alternar entre pendentes, todos e enviados.</span></div>` + visibleRequests.map(request => {
            const status = request.status || (request.requestType === "connection_request" ? "connection_pending" : "data_pending");
            const canAnalyze = request.direction !== "enviado" && !String(status).includes("approved") && !String(status).includes("denied");

            const requested = request.requestedData || {};
            const importedSalary = request.importedSalary || requested.importedSalary || 0;
            const externalBalance = request.externalBalance || requested.externalBalance || 0;
            const externalDebt = request.externalDebt || requested.externalDebt || 0;
            const externalLimit = request.externalLimit || requested.externalLimit || 0;

            const isConnection = request.requestType === "connection_request";

            return `
                <article class="of-request-card">
                    <div class="of-request-top">
                        <div>
                            <span class="of-source">${escapeOpenFinanceText((request.direction === "enviado" ? "Enviado para " : "Recebido de ") + (request.direction === "enviado" ? (request.partnerBank || "Deas Finance") : (request.sourceBank || "Deas Finance")))}</span>
                            <h3>${escapeOpenFinanceText(request.userName || "Cliente")}</h3>
                            <p>${escapeOpenFinanceText(request.emailMasked || "e-mail protegido")}</p>
                        </div>
                        <span class="of-status ${openFinanceStatusClass(status)}">${openFinanceStatusLabel(status)}</span>
                    </div>

                    <div class="of-data-grid">
                        ${isConnection ? `
                            <div><small>Tipo</small><strong>Conectar contas</strong></div>
                            <div><small>Usuário</small><strong>Mesma pessoa</strong></div>
                            <div><small>Dados financeiros</small><strong>Ainda não</strong></div>
                            <div><small>Senha</small><strong>Nunca enviada</strong></div>
                        ` : `
                            <div><small>Salário/renda</small><strong>${formatOpenFinanceMoney(importedSalary)}</strong></div>
                            <div><small>Saldo informado</small><strong>${formatOpenFinanceMoney(externalBalance)}</strong></div>
                            <div><small>Dívidas</small><strong>${formatOpenFinanceMoney(externalDebt)}</strong></div>
                            <div><small>Limite</small><strong>${formatOpenFinanceMoney(externalLimit)}</strong></div>
                        `}
                    </div>

                    <div class="of-consent-line">
                        <strong>Finalidade:</strong> ${escapeOpenFinanceText(openFinancePurposeLabel(request))}
                    </div>

                    ${status === "connection_approved" ? `<div class="of-result approved">Conexão autorizada pelo DeasBank.</div>` : ""}
                    ${status === "connection_denied" ? `<div class="of-result denied">Conexão recusada pelo DeasBank.</div>` : ""}
                    ${status === "data_approved" ? `<div class="of-result approved">Transferência de renda/dados aceita.</div>` : ""}
                    ${status === "data_denied" ? `<div class="of-result denied">Transferência de renda/dados recusada.</div>` : ""}

                    <div class="of-actions">
                        ${canAnalyze ? `
                            <button class="btn-action of-approve" onclick="approveOpenFinanceRequest('${request.id}', '${request.requestType || ""}')">Aceitar solicitação</button>
                            <button class="btn-action of-deny" onclick="denyOpenFinanceRequest('${request.id}', '${request.requestType || ""}')">Recusar</button>
                        ` : `<small>${escapeOpenFinanceText(request.direction === "enviado" ? "Aguardando/verificando resposta do parceiro" : (request.analysisMessage || "Solicitação analisada"))}</small>`}
                    </div>
                </article>
            `;
        }).join("");
    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="of-empty-state">Erro ao carregar solicitações: ${escapeOpenFinanceText(error.message)}</div>`;
    }
}

async function getOpenFinanceRequest(requestId) {
    const snap = await deasBankDb.collection("openFinanceRequests").doc(requestId).get();

    return snap.exists ? snap.data() : null;
}

async function approveOpenFinanceRequest(requestId, requestType = "") {
    if (!deasBankDb) return alert("Firebase não iniciou.");

    try {
        const current = await getOpenFinanceRequest(requestId);
        const type = requestType || current?.requestType;
        if (current?.status === "data_approved" || current?.status === "connection_approved") {
            alert("Esse pedido já foi aprovado e não será processado novamente.");
            return;
        }

        const nextStatus = type === "data_transfer_request" ? "data_approved" : "connection_approved";
        const message = type === "data_transfer_request"
            ? "Transferência de renda/dados aceita pelo DeasBank."
            : "Conexão Open Finance aceita pelo DeasBank.";

        const updatePayload = {
            status: nextStatus,
            analysisMessage: message,
            analyzedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (type === "data_transfer_request") {
            const user = ClientRegistry.get(currentUserId);
            const requested = current?.requestedData || {};
            const amount = Number(requested.importedSalary || current?.importedSalary || 0);
            if (amount > 0 && user) {
                const available = Number(user.saldo || 0);
                if (available < amount) {
                    alert(`Saldo insuficiente no DeasBank para transferir ${formatOpenFinanceMoney(amount)}. Disponível: ${formatOpenFinanceMoney(available)}.`);
                    return;
                }
                const updatedUser = await applyDeasBankBalanceDelta(-amount, current?.moneyMoveId || `move_${requestId}`, "Salário enviado ao Deas Finance");
                updatePayload.importedSalary = amount;
                updatePayload.transferAmount = amount;
                updatePayload.moneyMoved = true;
                updatePayload.moneyMoveId = current?.moneyMoveId || `move_${requestId}`;
                updatePayload.transferSourceBank = 'DeasBank';
                updatePayload.transferDestinationBank = current?.sourceBank || 'Deas Finance';
                updatePayload.externalBalance = Number((ClientRegistry.get(currentUserId) || {}).saldo || 0);
                updatePayload.externalDebt = sumDebts(user.dividas || []);
                updatePayload.externalLimit = Number(user.limite || 0);
                updatePayload.loansTotal = sumDebts(user.dividas || []);
                updatePayload.creditScore = Number(user.scoreOriginal || user.score || 500);
                updatePayload.estimatedIncome = Number(user.renda || user.salario || amount || 0);
                updatePayload.relationshipSummary = `Conta DeasBank: saldo ${formatOpenFinanceMoney(updatePayload.externalBalance)}, dívidas ${formatOpenFinanceMoney(updatePayload.externalDebt)}, limite ${formatOpenFinanceMoney(updatePayload.externalLimit)}, empréstimos ${formatOpenFinanceMoney(updatePayload.loansTotal)}, score ${updatePayload.creditScore}, renda ${formatOpenFinanceMoney(updatePayload.estimatedIncome)}.`;
                updatePayload.requestedData = { importedSalary: amount, requestedSalaryAmount: amount, externalBalance: updatePayload.externalBalance, externalDebt: updatePayload.externalDebt, externalLimit: updatePayload.externalLimit, loansTotal: updatePayload.loansTotal, creditScore: updatePayload.creditScore, estimatedIncome: updatePayload.estimatedIncome, relationshipSummary: updatePayload.relationshipSummary }; 
                renderDashboard(ClientRegistry.get(currentUserId) || user);
            }
        }

        await deasBankDb.collection("openFinanceRequests").doc(requestId).update(updatePayload);

        alert("Solicitação aceita com sucesso.");
        loadOpenFinanceRequests();
    } catch (error) {
        alert("Erro ao aceitar: " + error.message);
    }
}

async function denyOpenFinanceRequest(requestId, requestType = "") {
    if (!deasBankDb) return alert("Firebase não iniciou.");

    try {
        const current = await getOpenFinanceRequest(requestId);
        const type = requestType || current?.requestType;
        if (current?.status === "data_approved" || current?.status === "connection_approved") {
            alert("Esse pedido já foi aprovado e não será processado novamente.");
            return;
        }

        const nextStatus = type === "data_transfer_request" ? "data_denied" : "connection_denied";
        const message = type === "data_transfer_request"
            ? "Transferência de renda/dados recusada pelo DeasBank."
            : "Conexão Open Finance recusada pelo DeasBank.";

        await deasBankDb.collection("openFinanceRequests").doc(requestId).update({
            status: nextStatus,
            approvedAmount: 0,
            analysisMessage: message,
            analyzedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("Solicitação recusada.");
        loadOpenFinanceRequests();
    } catch (error) {
        alert("Erro ao recusar: " + error.message);
    }
}


async function requestDeasFinanceConnection() {
    if (!deasBankDb || !deasFinanceDb) return alert("Firebase não iniciou corretamente.");

    const user = ClientRegistry.get(currentUserId);
    if (!user) return alert("Entre na sua conta primeiro.");

    try {
        const payload = {
            consentId: `deasbank_consent_${currentUserId}_${Date.now()}`,
            sourceBank: "DeasBank",
            partnerBank: "Deas Finance",
            userId: currentUserId,
            userName: user.nome || "Cliente DeasBank",
            emailMasked: maskEmailForOpenFinance(user.email),
            purpose: "solicitacao_conexao_open_finance",
            requestType: "connection_request",
            sameOwner: true,
            status: "connection_pending",
            direction: "incoming_to_deasfinance",
            createdAtText: new Date().toISOString(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const ref = await deasFinanceDb.collection("openFinanceRequests").add(payload);
        await deasBankDb.collection("users").doc(currentUserId).collection("openFinanceConnections").doc("deasfinance").set({
            institutionName: "Deas Finance",
            partnerKey: "deasfinance",
            connectionMode: "firebase_mutual_openfinance",
            partnerRequestId: ref.id,
            connectionStatus: "connection_pending",
            sharedPayload: { ...payload, partnerRequestId: ref.id },
            createdAtText: new Date().toISOString(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        updateMutualDataVisibility("connection_pending", false);
        alert("Conexão solicitada ao Deas Finance. Agora o Deas Finance pode aceitar ou recusar.");
        loadOpenFinanceRequests();
    } catch (error) {
        alert("Erro ao solicitar conexão: " + error.message);
    }
}

async function requestDeasFinanceData() {
    if (!deasBankDb || !deasFinanceDb) return alert("Firebase não iniciou corretamente.");

    const user = ClientRegistry.get(currentUserId);
    if (!user) return alert("Entre na sua conta primeiro.");

    try {
        const localRef = deasBankDb.collection("users").doc(currentUserId).collection("openFinanceConnections").doc("deasfinance");
        const localSnap = await localRef.get();
        const local = localSnap.exists ? localSnap.data() : null;

        if (!local || !(local.connectionApproved === true || local.connectionStatus === "connection_approved" || local.connectionStatus === "data_approved" || local.connectionStatus === "data_denied")) {
            alert("Primeiro solicite a conexão e aguarde o Deas Finance aceitar.");
            return;
        }

        const requestedSalary = Number(prompt("Quanto de salário deseja trazer do Deas Finance para o DeasBank?", "3200") || 0);
        if (requestedSalary <= 0) return alert("Informe um valor válido para trazer salário.");

        const moveId = `move_deasbank_to_deasfinance_${currentUserId}_${Date.now()}`;
        const payload = {
            consentId: `deasbank_data_${currentUserId}_${Date.now()}`,
            moneyMoveId: moveId,
            sourceBank: "DeasBank",
            partnerBank: "Deas Finance",
            userId: currentUserId,
            userName: user.nome || "Cliente DeasBank",
            emailMasked: maskEmailForOpenFinance(user.email),
            purpose: "solicitacao_transferencia_completa_open_finance",
            requestType: "data_transfer_request",
            sameOwner: true,
            permissions: { income: true, balance: true, debts: true, creditLimit: true, loans: true, score: true },
            requestedData: { importedSalary: requestedSalary, requestedSalaryAmount: requestedSalary, requestAllFinancialData: true },
            importedSalary: requestedSalary,
            status: "data_pending",
            direction: "incoming_to_deasfinance",
            createdAtText: new Date().toISOString(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const ref = await deasFinanceDb.collection("openFinanceRequests").add(payload);
        await localRef.set({
            dataRequestId: ref.id,
            connectionStatus: "data_pending",
            connectionApproved: true,
            moneyMoveId: moveId,
            requestedSalary: requestedSalary,
            sharedPayload: { ...payload, partnerRequestId: ref.id },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        alert("Pedido para trazer salário enviado ao Deas Finance. Depois que ele aceitar, clique em “Sincronizar respostas”.");
        loadOpenFinanceRequests();
    } catch (error) {
        alert("Erro ao pedir dados: " + error.message);
    }
}

async function syncDeasFinanceResponse() {
    if (!deasBankDb || !deasFinanceDb) return alert("Firebase não iniciou corretamente.");

    try {
        const localRef = deasBankDb.collection("users").doc(currentUserId).collection("openFinanceConnections").doc("deasfinance");
        const localSnap = await localRef.get();
        if (!localSnap.exists) return alert("Nenhum pedido enviado ao Deas Finance.");

        const local = localSnap.data();
        const requestId = local.dataRequestId || local.partnerRequestId || local.sharedPayload?.partnerRequestId;
        if (!requestId) return alert("Não encontrei o ID da solicitação.");

        const partnerSnap = await deasFinanceDb.collection("openFinanceRequests").doc(requestId).get();
        if (!partnerSnap.exists) return alert("A solicitação ainda não apareceu no Deas Finance.");

        const partner = partnerSnap.data();
        const status = partner.status || "connection_pending";
        const update = {
            connectionStatus: status,
            connectionApproved: status === "connection_approved" || status === "data_approved" || status === "data_denied" ? true : (status === "connection_denied" ? false : local.connectionApproved === true),
            sharedPayload: { ...(local.sharedPayload || {}), ...partner, partnerRequestId: requestId },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (status === "data_approved") {
            update.importedSalary = Number(partner.transferAmount || partner.importedSalary || partner.requestedData?.importedSalary || 0);
            update.externalBalance = Number(partner.externalBalance || partner.requestedData?.externalBalance || 0);
            update.externalDebt = Number(partner.externalDebt || partner.requestedData?.externalDebt || 0);
            update.externalLimit = Number(partner.externalLimit || partner.requestedData?.externalLimit || 0);
            update.externalLoans = Number(partner.loansTotal || partner.requestedData?.loansTotal || 0);
            update.externalScore = Number(partner.creditScore || partner.requestedData?.creditScore || 0);
            update.externalIncome = Number(partner.estimatedIncome || partner.requestedData?.estimatedIncome || update.importedSalary || 0);
            update.relationshipSummary = partner.relationshipSummary || partner.requestedData?.relationshipSummary || "";

            const user = ClientRegistry.get(currentUserId);
            if (user) {
                user.scoreOriginal = Math.min(950, Math.max(Number(user.scoreOriginal || 500), update.externalScore || 0) + (update.importedSalary >= 3000 ? 30 : 10));
                user.limite = Math.max(Number(user.limite || 0), update.externalLimit || 0);
                const moveId = partner.moneyMoveId || local.moneyMoveId || `move_${requestId}`;
                const alreadyApplied = local.appliedMoneyMoveId === moveId || Boolean(local.moneyMovedApplied && !moveId);
                if (partner.moneyMoved && !alreadyApplied && update.importedSalary > 0) {
                    const updatedUser = await applyDeasBankBalanceDelta(update.importedSalary, moveId, "Salário recebido do Deas Finance");
                    update.appliedMoneyMoveId = moveId;
                    update.moneyMovedApplied = true;
                    alert(`Salário transferido: ${formatOpenFinanceMoney(update.importedSalary)} entrou no saldo disponível do DeasBank. Saldo atual: ${formatOpenFinanceMoney(updatedUser.saldo)}.`);
                } else if (alreadyApplied) {
                    update.appliedMoneyMoveId = local.appliedMoneyMoveId || moveId;
                    update.moneyMovedApplied = true;
                }
                renderDashboard(ClientRegistry.get(currentUserId) || user);
            }
        }

        updateMutualDataVisibility(status, update.connectionApproved);
        await localRef.set(update, { merge: true });
        renderDeasFinanceImportedData({ ...local, ...update });
        alert(openFinanceStatusLabel(status));
        loadOpenFinanceRequests();
    } catch (error) {
        alert("Erro ao verificar resposta: " + error.message);
    }
}

function maskEmailForOpenFinance(email) {
    const [user, domain] = String(email || "cliente@email.com").split("@");
    return `${user.slice(0, 3)}***@${domain || "email.com"}`;
}


/* Open Finance profissional v5 - overrides seguros */
function getBankFinancialSnapshot(afterBalance) {
    const user = ClientRegistry.get(currentUserId) || {};
    const debts = sumDebts(user.dividas || []);
    const loansTotal = (user.dividas || []).filter(d => String(d.empresa || '').toLowerCase().includes('deasbank')).reduce((a,b)=>a+Number(b.valor||0),0);
    const balance = Number(afterBalance ?? user.saldo ?? 0);
    return {
        externalBalance: balance,
        externalDebt: debts,
        externalLimit: Number(user.limite || 0),
        loansTotal,
        creditScore: Number(user.scoreOriginal || user.score || 500),
        estimatedIncome: Number(user.renda || user.salario || 3200),
        investmentsTotal: Number(user.investimentos || user.investmentsTotal || 0)
    };
}

async function applyDeasBankBalanceDeltaOnce(amount, moveId, reason = 'Open Finance') {
    const value = Number(amount || 0);
    if (!currentUserId || !deasBankDb || !value) return { user: ClientRegistry.get(currentUserId), applied: false };
    const safeMoveId = String(moveId || `move_${Date.now()}`);
    const ref = deasBankDb.collection('users').doc(currentUserId);
    const snap = await ref.get();
    const latest = snap.exists ? snap.data() : (ClientRegistry.get(currentUserId) || {});
    const appliedMoves = latest.openFinanceAppliedMoves || {};
    if (appliedMoves[safeMoveId]) {
        const merged = { uid: currentUserId, ...latest };
        ClientRegistry.insert(currentUserId, merged);
        renderDashboard(merged);
        return { user: merged, applied: false };
    }
    const nextSaldo = Number(latest.saldo || 0) + value;
    const update = {
        saldo: nextSaldo,
        [`openFinanceAppliedMoves.${safeMoveId}`]: true,
        lastOpenFinanceMoveId: safeMoveId,
        lastOpenFinanceMoveReason: reason,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(update, { merge: true });
    const merged = { uid: currentUserId, ...latest, saldo: nextSaldo, openFinanceAppliedMoves: { ...appliedMoves, [safeMoveId]: true }, lastOpenFinanceMoveId: safeMoveId, lastOpenFinanceMoveReason: reason };
    ClientRegistry.insert(currentUserId, merged);
    renderDashboard(merged);
    refreshOpenFinanceMirrors();
    return { user: merged, applied: true };
}

function refreshOpenFinanceMirrors(){
    const user = ClientRegistry.get(currentUserId) || {};
    const set=(id,v)=>{const el=document.getElementById(id); if(el) el.innerText=v};
    set('ofAvailableBalanceBank', formatOpenFinanceMoney(user.saldo || 0));
    set('ofBankLimitMirror', formatOpenFinanceMoney(user.limite || 0));
    set('ofBankDebtMirror', formatOpenFinanceMoney(sumDebts(user.dividas || [])));
}

renderDeasFinanceImportedData = function(local = {}) {
    const payload = local.sharedPayload || {};
    const status = String(local.connectionStatus || payload.status || 'connection_pending');
    const badge = document.getElementById('deasFinanceConnectionBadge');
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.innerText = value; };
    if (badge) { badge.innerText = openFinanceStatusLabel(status); badge.className = `of-status ${openFinanceStatusClass(status)}`; }
    setText('ofImportedSalaryBank', formatOpenFinanceMoney(local.importedSalary || payload.importedSalary || payload.transferAmount || 0));
    setText('ofExternalBalanceBank', formatOpenFinanceMoney(local.externalBalance || payload.externalBalance || 0));
    setText('ofExternalDebtBank', formatOpenFinanceMoney(local.externalDebt || payload.externalDebt || 0));
    setText('ofExternalLimitBank', formatOpenFinanceMoney(local.externalLimit || payload.externalLimit || 0));
    setText('ofExternalLoansBank', formatOpenFinanceMoney(local.externalLoans || payload.loansTotal || 0));
    setText('ofExternalInvestmentsBank', formatOpenFinanceMoney(local.externalInvestments || payload.investmentsTotal || 0));
    setText('ofExternalIncomeBank', formatOpenFinanceMoney(local.externalIncome || payload.estimatedIncome || 0));
    setText('ofExternalScoreBank', String(local.externalScore || payload.creditScore || '-'));
    const summary = document.getElementById('ofRelationshipSummaryBank');
    if (summary) {
        const hasData = status === 'data_approved' || Number(local.importedSalary || payload.importedSalary || payload.transferAmount || 0) > 0;
        summary.innerText = hasData ? (local.relationshipSummary || payload.relationshipSummary || 'Dados recebidos com consentimento.') : 'Conta conectada. Solicite “Trazer salário” para preencher esta visão.';
    }
    updateMutualDataVisibility(status, local.connectionApproved === true || ['connection_approved','data_pending','data_approved','data_denied'].includes(status));
    refreshOpenFinanceMirrors();
};

updateMutualDataVisibility = function(connectionStatus, connectionApproved = false) {
    const btn = document.getElementById('requestDeasFinanceDataCard');
    const stepConsent = document.getElementById('ofStepConsentBank');
    const stepData = document.getElementById('ofStepDataBank');
    const connectedPanel = document.getElementById('deasFinanceConnectedPanel');
    const onboardingPanel = document.getElementById('deasFinanceOnboardingPanel');
    const disconnectBtn = document.getElementById('disconnectDeasFinanceBtn');
    const status = String(connectionStatus || '');
    const hasApproved = !['consent_revoked','connection_denied','connection_pending'].includes(status) && (connectionApproved === true || ['connection_approved','data_pending','data_approved','data_denied'].includes(status));
    const canRequest = hasApproved && ['connection_approved','data_approved','data_denied'].includes(status);
    if (btn) btn.classList.toggle('hidden', !canRequest);
    if (connectedPanel) connectedPanel.classList.toggle('hidden', status !== 'data_approved');
    if (onboardingPanel) onboardingPanel.classList.add('hidden');
    if (disconnectBtn) disconnectBtn.classList.toggle('hidden', !hasApproved && status !== 'connection_pending');
    if (stepConsent) stepConsent.classList.toggle('done', hasApproved);
    if (stepData) stepData.classList.toggle('done', status === 'data_approved');
};
approveOpenFinanceRequest = async function(requestId, requestType = '') {
    if (!deasBankDb) return alert('Firebase não iniciou.');
    try {
        const current = await getOpenFinanceRequest(requestId);
        if (!current) return alert('Pedido não encontrado.');
        const type = requestType || current.requestType;
        const existingStatus = current.status || (type === 'data_transfer_request' ? 'data_pending' : 'connection_pending');
        if (existingStatus === 'data_approved' || existingStatus === 'connection_approved') return alert('Esse pedido já foi aprovado.');
        const updatePayload = {
            status: type === 'data_transfer_request' ? 'data_approved' : 'connection_approved',
            analysisMessage: type === 'data_transfer_request' ? 'Dados financeiros e portabilidade de salário liberados pelo DeasBank.' : 'Conexão Open Finance aceita pelo DeasBank.',
            analyzedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (type === 'data_transfer_request') {
            const requested = current.requestedData || {};
            const amount = Number(requested.requestedSalaryAmount || requested.importedSalary || current.importedSalary || 0);
            const user = ClientRegistry.get(currentUserId) || {};
            if (amount > Number(user.saldo || 0)) return alert(`Saldo insuficiente no DeasBank. Disponível: ${formatOpenFinanceMoney(user.saldo || 0)}.`);
            const moveId = current.moneyMoveId || `move_${requestId}`;
            const result = amount > 0 ? await applyDeasBankBalanceDeltaOnce(-amount, moveId + '_origem_deasbank', 'Portabilidade enviada ao Deas Finance') : { user, applied:false };
            const snapshot = getBankFinancialSnapshot(result.user?.saldo);
            Object.assign(updatePayload, snapshot, {
                importedSalary: amount,
                transferAmount: amount,
                moneyMoved: amount > 0,
                moneyMoveId: moveId,
                transferSourceBank: 'DeasBank',
                transferDestinationBank: current.sourceBank || 'Deas Finance',
                balanceRange: amount > 0 ? 'Valor transferido com sucesso' : 'Sem transferência de valor',
            });
            updatePayload.relationshipSummary = `DeasBank compartilhou salário ${formatOpenFinanceMoney(amount)}, saldo ${formatOpenFinanceMoney(snapshot.externalBalance)}, dívidas ${formatOpenFinanceMoney(snapshot.externalDebt)}, limite/cartões ${formatOpenFinanceMoney(snapshot.externalLimit)}, empréstimos ${formatOpenFinanceMoney(snapshot.loansTotal)}, investimentos ${formatOpenFinanceMoney(snapshot.investmentsTotal)}, score ${snapshot.creditScore} e renda ${formatOpenFinanceMoney(snapshot.estimatedIncome)}.`;
            updatePayload.requestedData = { importedSalary: amount, requestedSalaryAmount: amount, ...snapshot, relationshipSummary: updatePayload.relationshipSummary };
        }
        await deasBankDb.collection('openFinanceRequests').doc(requestId).update(updatePayload);
        alert(type === 'data_transfer_request' ? 'Dados liberados. O outro banco deve sincronizar para o dinheiro cair no saldo disponível dele.' : 'Conexão aceita.');
        loadOpenFinanceRequests();
    } catch(error) { alert('Erro ao aceitar: ' + error.message); }
};

disconnectDeasFinanceConnection = async function() {
    if (!deasBankDb || !deasFinanceDb) return alert('Firebase não iniciou corretamente.');
    try {
        const localRef = deasBankDb.collection('users').doc(currentUserId).collection('openFinanceConnections').doc('deasfinance');
        const localSnap = await localRef.get();
        if (!localSnap.exists) return alert('Nenhuma conexão para cancelar.');
        const local = localSnap.data();
        const ids = [local.dataRequestId, local.partnerRequestId, local.sharedPayload?.partnerRequestId].filter(Boolean);
        for (const id of ids) {
            try {
                await deasFinanceDb.collection('openFinanceRequests').doc(id).set({
                    status: 'consent_revoked',
                    analysisMessage: 'Compartilhamento cancelado pelo cliente no DeasBank.',
                    revokedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch(_) {}
        }
        await localRef.set({
            connectionStatus: 'consent_revoked',
            connectionApproved: false,
            sharedPayload: { ...(local.sharedPayload || {}), status: 'consent_revoked', connectionStatus: 'consent_revoked' },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        updateMutualDataVisibility('consent_revoked', false);
        renderDeasFinanceImportedData({ connectionStatus: 'consent_revoked', connectionApproved: false, sharedPayload: { status: 'consent_revoked' } });
        alert('Conexão Open Finance cancelada.');
        loadOpenFinanceRequests();
    } catch(error) { alert('Erro ao desconectar: ' + error.message); }
};

syncDeasFinanceResponse = async function() {
    if (!deasBankDb || !deasFinanceDb) return alert('Firebase não iniciou corretamente.');
    try {
        const localRef = deasBankDb.collection('users').doc(currentUserId).collection('openFinanceConnections').doc('deasfinance');
        const localSnap = await localRef.get();
        if (!localSnap.exists) return alert('Nenhum pedido enviado ao Deas Finance.');
        const local = localSnap.data();
        const requestId = local.dataRequestId || local.partnerRequestId || local.sharedPayload?.partnerRequestId;
        if (!requestId) return alert('Não encontrei o ID da solicitação.');
        const partnerSnap = await deasFinanceDb.collection('openFinanceRequests').doc(requestId).get();
        if (!partnerSnap.exists) return alert('A solicitação ainda não apareceu no Deas Finance.');
        const partner = partnerSnap.data();
        const status = partner.status || 'connection_pending';
        const update = {
            connectionStatus: status,
            connectionApproved: ['connection_approved','data_approved','data_denied'].includes(status) ? true : (status === 'connection_denied' ? false : local.connectionApproved === true),
            sharedPayload: { ...(local.sharedPayload || {}), ...partner, partnerRequestId: requestId, connectionStatus: status },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (status === 'data_approved') {
            const amount = Number(partner.transferAmount || partner.importedSalary || partner.requestedData?.importedSalary || 0);
            const moveId = partner.moneyMoveId || local.moneyMoveId || `move_${requestId}`;
            update.importedSalary = amount;
            update.externalBalance = Number(partner.externalBalance || partner.requestedData?.externalBalance || 0);
            update.externalDebt = Number(partner.externalDebt || partner.requestedData?.externalDebt || 0);
            update.externalLimit = Number(partner.externalLimit || partner.requestedData?.externalLimit || 0);
            update.externalLoans = Number(partner.loansTotal || partner.requestedData?.loansTotal || 0);
            update.externalInvestments = Number(partner.investmentsTotal || partner.requestedData?.investmentsTotal || 0);
            update.externalScore = Number(partner.creditScore || partner.requestedData?.creditScore || 0);
            update.externalIncome = Number(partner.estimatedIncome || partner.requestedData?.estimatedIncome || amount || 0);
            update.relationshipSummary = partner.relationshipSummary || partner.requestedData?.relationshipSummary || '';
            if (partner.moneyMoved && amount > 0) {
                const result = await applyDeasBankBalanceDeltaOnce(amount, moveId + '_destino_deasbank', 'Portabilidade recebida do Deas Finance');
                update.appliedMoneyMoveId = moveId;
                update.moneyMovedApplied = true;
                if (result.applied) alert(`Portabilidade concluída: ${formatOpenFinanceMoney(amount)} entrou no saldo disponível do DeasBank.`);
            }
            const user = ClientRegistry.get(currentUserId) || {};
            user.scoreOriginal = Math.min(950, Math.max(Number(user.scoreOriginal || 500), update.externalScore || 0) + (amount >= 3000 ? 30 : 10));
            user.limite = Math.max(Number(user.limite || 0), update.externalLimit || 0);
            await persistCurrentUser();
        }
        await localRef.set(update, { merge: true });
        updateMutualDataVisibility(status, update.connectionApproved);
        renderDeasFinanceImportedData({ ...local, ...update });
        refreshOpenFinanceMirrors();
        alert(openFinanceStatusLabel(status));
        loadOpenFinanceRequests();
    } catch(error) { alert('Erro ao verificar resposta: ' + error.message); }
};

const originalLoadOpenFinanceRequestsV5 = loadOpenFinanceRequests;
loadOpenFinanceRequests = async function(){
    refreshOpenFinanceMirrors();
    await originalLoadOpenFinanceRequestsV5();
};


/* ===================== OPEN FINANCE V8 - PROFISSIONAL =====================
   - Conexão aceita em qualquer banco passa a valer para os dois lados.
   - Score é compartilhado já na conexão e novamente nos dados.
   - Portabilidade credita diretamente o saldo disponível do banco destino.
   - Usa travas por moneyMoveId para não duplicar valores.
============================================================================ */
function ofV8SafeKey(value){ return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_'); }
function ofV8CurrentScore(){ const u = ClientRegistry.get(currentUserId) || {}; return Number(u.score || u.scoreOriginal || 500); }
async function mirrorConnectionToBothSidesFromBank(request, status){
    const isApproved = status === 'connection_approved' || status === 'data_approved' || status === 'data_denied';
    const payload = {
        institutionName: 'Deas Finance',
        partnerKey: 'deasfinance',
        connectionMode: 'firebase_mutual_openfinance',
        connectionStatus: status,
        connectionApproved: isApproved,
        sameOwner: true,
        partnerRequestId: request.id || request.partnerRequestId || request.requestId || null,
        sharedScore: ofV8CurrentScore(),
        sharedPayload: { ...request, status, connectionStatus: status, sameOwner: true, sharedScore: ofV8CurrentScore() },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try { await deasBankDb.collection('users').doc(currentUserId).collection('openFinanceConnections').doc('deasfinance').set(payload,{merge:true}); } catch(e){ console.warn('mirror local bank failed', e); }
    if (request && request.userId && deasFinanceDb) {
        try {
            await deasFinanceDb.collection('users').doc(request.userId).collection('openFinanceConnections').doc('deasbank').set({
                institutionName: 'DeasBank',
                partnerKey: 'deasbank',
                connectionMode: 'firebase_mutual_openfinance',
                connectionStatus: status,
                connectionApproved: isApproved,
                sameOwner: true,
                partnerRequestId: request.id || request.partnerRequestId || request.requestId || null,
                sharedScore: ofV8CurrentScore(),
                sharedPayload: { ...request, status, connectionStatus: status, sameOwner: true, sharedScore: ofV8CurrentScore() },
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, {merge:true});
        } catch(e){ console.warn('mirror remote finance failed', e); }
    }
}
async function creditDeasFinanceDestinationFromBank(financeUid, amount, moveId, request){
    amount = Number(amount || 0);
    if (!financeUid || !deasFinanceDb || amount <= 0) return {applied:false, reason:'sem_valor'};
    const safe = ofV8SafeKey((moveId || 'openfinance') + '_destino_deasfinance');
    const ref = deasFinanceDb.collection('accounts').doc(financeUid);
    const snap = await ref.get();
    const current = snap.exists ? snap.data() : { balance: 0 };
    const appliedMoves = current.openFinanceAppliedMoves || {};
    if (appliedMoves[safe]) return {applied:false, reason:'ja_aplicado'};
    const nextBalance = Number(current.balance || 0) + amount;
    await ref.set({
        ...current,
        balance: nextBalance,
        [`openFinanceAppliedMoves.${safe}`]: true,
        lastOpenFinanceMoveId: safe,
        lastOpenFinanceMoveReason: 'Portabilidade recebida do DeasBank',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
    try {
        await deasFinanceDb.collection('users').doc(financeUid).collection('transactions').add({
            creditor: 'Portabilidade recebida do DeasBank',
            value: amount,
            status: 'pago',
            type: 'Open Finance',
            date: new Date().toLocaleDateString('pt-BR'),
            createdAtText: new Date().toISOString(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            moneyMoveId: safe
        });
    } catch(e){ console.warn('remote finance tx failed', e); }
    return {applied:true, nextBalance};
}

const approveOpenFinanceRequestV7 = approveOpenFinanceRequest;
approveOpenFinanceRequest = async function(requestId, requestType = ''){
    if (!deasBankDb) return alert('Firebase não iniciou.');
    try {
        const snap = await deasBankDb.collection('openFinanceRequests').doc(requestId).get();
        if (!snap.exists) return alert('Pedido não encontrado.');
        const current = { id: requestId, ...snap.data() };
        const type = requestType || current.requestType;
        if (current.status === 'data_approved' || current.status === 'connection_approved') return alert('Esse pedido já foi aprovado.');
        const nextStatus = type === 'data_transfer_request' ? 'data_approved' : 'connection_approved';
        const user = ClientRegistry.get(currentUserId) || await loadUserFromFirestore(currentUserId) || {};
        const score = Number(user.score || user.scoreOriginal || 500);
        const payload = {
            status: nextStatus,
            sameOwner: true,
            connectionApproved: true,
            sharedScore: score,
            creditScore: score,
            analysisMessage: type === 'data_transfer_request' ? 'Dados financeiros completos e portabilidade liberados pelo DeasBank.' : 'Conexão Open Finance aceita pelo DeasBank. A conexão agora vale para os dois bancos.',
            analyzedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (type === 'connection_request') {
            payload.externalScore = score;
            payload.relationshipSummary = `Conexão aprovada. Score DeasBank compartilhado: ${score}. Dados financeiros completos exigem consentimento separado.`;
            await mirrorConnectionToBothSidesFromBank(current, nextStatus);
        }
        if (type === 'data_transfer_request') {
            const requested = current.requestedData || {};
            const amount = Number(requested.importedSalary || requested.requestedSalaryAmount || current.importedSalary || 0);
            const available = Number(user.saldo || 0);
            if (amount > 0 && available < amount) return alert(`Saldo insuficiente no DeasBank para transferir ${formatOpenFinanceMoney(amount)}. Disponível: ${formatOpenFinanceMoney(available)}.`);
            const moveId = current.moneyMoveId || `move_${requestId}`;
            if (amount > 0) await applyDeasBankBalanceDeltaOnce(-amount, moveId + '_origem_deasbank', 'Portabilidade enviada ao Deas Finance');
            const updatedUser = ClientRegistry.get(currentUserId) || user;
            const externalBalance = Number(updatedUser.saldo || 0);
            const externalDebt = sumDebts(updatedUser.dividas || []);
            const externalLimit = Number(updatedUser.limite || 0);
            const loansTotal = externalDebt;
            const estimatedIncome = Number(updatedUser.renda || updatedUser.salario || amount || 0);
            Object.assign(payload, {
                importedSalary: amount,
                transferAmount: amount,
                moneyMoved: amount > 0,
                moneyMoveId: moveId,
                transferSourceBank: 'DeasBank',
                transferDestinationBank: current.sourceBank || 'Deas Finance',
                externalBalance,
                externalDebt,
                externalLimit,
                loansTotal,
                investmentsTotal: Number(updatedUser.investimentos || 0),
                creditScore: score,
                externalScore: score,
                estimatedIncome,
                requestedData: { importedSalary: amount, requestedSalaryAmount: amount, externalBalance, externalDebt, externalLimit, loansTotal, investmentsTotal: Number(updatedUser.investimentos || 0), creditScore: score, estimatedIncome, requestAllFinancialData:true },
                relationshipSummary: `DeasBank compartilhou salário ${formatOpenFinanceMoney(amount)}, saldo ${formatOpenFinanceMoney(externalBalance)}, dívidas ${formatOpenFinanceMoney(externalDebt)}, limite/cartões ${formatOpenFinanceMoney(externalLimit)}, empréstimos ${formatOpenFinanceMoney(loansTotal)}, score ${score} e renda ${formatOpenFinanceMoney(estimatedIncome)}.`
            });
            if (amount > 0 && current.userId) {
                await creditDeasFinanceDestinationFromBank(current.userId, amount, moveId, current);
                payload.destinationCredited = true;
            }
            await mirrorConnectionToBothSidesFromBank(current, nextStatus);
            renderDashboard(ClientRegistry.get(currentUserId) || user);
        }
        await deasBankDb.collection('openFinanceRequests').doc(requestId).update(payload);
        updateMutualDataVisibility(nextStatus, true);
        refreshOpenFinanceMirrors();
        alert(type === 'data_transfer_request' ? 'Aprovado. O valor foi abatido do DeasBank e creditado no saldo disponível do Deas Finance.' : 'Conexão aprovada. Ela agora vale nos dois bancos.');
        loadOpenFinanceRequests();
    } catch(error){ alert('Erro ao aceitar: ' + error.message); console.error(error); }
};

const oldRenderDeasFinanceImportedDataV8 = renderDeasFinanceImportedData;
renderDeasFinanceImportedData = function(local = {}){
    oldRenderDeasFinanceImportedDataV8(local);
    const scoreEl = document.getElementById('ofExternalScoreBank');
    const sharedScore = local.externalScore || local.creditScore || local.sharedScore || local.sharedPayload?.creditScore || local.sharedPayload?.sharedScore;
    if (scoreEl && sharedScore) scoreEl.textContent = String(sharedScore);
};


/* ===================== DEASBANK V9 - CONEXÃO MÚTUA, SCORE E SALDO DISPONÍVEL ===================== */
function ofV9BankPartnerScore(local={}){const p=local.sharedPayload||{};return Number(local.externalScore||local.sharedScore||p.externalScore||p.creditScore||p.sharedScore||0)}
function ofV9BankStatusPriority(c={}){const p=c.sharedPayload||{};const st=String(c.connectionStatus||p.connectionStatus||p.status||'connection_pending');const rank={data_approved:90,data_pending:80,connection_approved:70,data_denied:60,connection_pending:50,connection_denied:20,consent_revoked:10};return rank[st]||0}
async function ofV9GetBankConnection(){
  if(!deasBankDb||!currentUserId)return null;
  const snap=await deasBankDb.collection('users').doc(currentUserId).collection('openFinanceConnections').doc('deasfinance').get();
  return snap.exists?snap.data():null;
}
function ofV9SetBankHeaderButtons(status,approved){
  const disconnect=document.getElementById('disconnectDeasFinanceBtn');
  const requestData=document.getElementById('requestDeasFinanceDataCard');
  disconnect?.classList.toggle('hidden', !(approved||['connection_pending','data_pending'].includes(status)) );
  requestData?.classList.toggle('hidden', !(approved&&['connection_approved','data_approved','data_denied'].includes(status)) );
}
function ofV9PatchBankTexts(){
  document.querySelectorAll('h3,span,p,strong').forEach(el=>{ if(el.textContent && el.textContent.trim()==='Saldo Real') el.textContent='Saldo Disponível'; });
}
const ofV9OldRenderDashboard = renderDashboard;
renderDashboard = function(user){
  ofV9OldRenderDashboard(user);
  ofV9PatchBankTexts();
  const bal=document.getElementById('currentBalanceAmount'); if(bal) bal.textContent=formatOpenFinanceMoney(Number(user?.saldo||0));
  const ofBal=document.getElementById('ofAvailableBalanceBank'); if(ofBal) ofBal.textContent=formatOpenFinanceMoney(Number(user?.saldo||0));
};
const ofV9OldRenderDeasFinanceImportedData = renderDeasFinanceImportedData;
renderDeasFinanceImportedData = function(local={}){
  ofV9OldRenderDeasFinanceImportedData(local);
  const status=String(local.connectionStatus||local.sharedPayload?.connectionStatus||local.sharedPayload?.status||'');
  const approved=local.connectionApproved===true || ['connection_approved','data_pending','data_approved','data_denied'].includes(status);
  ofV9SetBankHeaderButtons(status,approved);
  const score=ofV9BankPartnerScore(local);
  const scoreEl=document.getElementById('ofExternalScoreBank'); if(scoreEl&&score) scoreEl.textContent=String(score);
  const card=document.querySelector('.of-status-card');
  if(card){
    let box=document.getElementById('ofBankConnectionMetrics');
    if(!box){box=document.createElement('div');box.id='ofBankConnectionMetrics';box.className='of-connection-metrics';card.appendChild(box);}
    const statusLabel=openFinanceStatusLabel(status||'connection_pending');
    const user=ClientRegistry.get(currentUserId)||{};
    const localScore=Number(user.score||calculateWeightedScore(user)||user.scoreOriginal||0)||'-';
    const impact=Number(user.lastOpenFinanceScoreImpact||local?.lastOpenFinanceScoreImpact||0);
    box.innerHTML=`<div><small>Status</small><strong>${statusLabel}</strong></div><div><small>Score recebido</small><strong>${score||'-'}</strong></div><div><small>Score DeasBank após impacto</small><strong>${localScore}${impact?` (${impact>0?'+':''}${impact})`:''}</strong></div><div><small>Mesma pessoa</small><strong>Sim, vínculo mútuo</strong></div>`;
  }
  const grid=document.querySelector('#openFinanceSection .of-professional-grid');
  if(grid){grid.classList.toggle('of-with-balance', approved);}
};
const ofV9OldLoadOpenFinanceRequests = loadOpenFinanceRequests;
loadOpenFinanceRequests = async function(){
  await ofV9OldLoadOpenFinanceRequests();
  try{ const local=await ofV9GetBankConnection(); if(local) renderDeasFinanceImportedData(local); else {ofV9SetBankHeaderButtons('',false); const grid=document.querySelector('#openFinanceSection .of-professional-grid'); grid?.classList.remove('of-with-balance');} }catch(e){console.warn('v9 bank connection state failed',e)}
  ofV9PatchBankTexts();
};


/* ===================== OPEN FINANCE PRO FINAL - Daniel Augusto =====================
   Corrige a organização final do Open Finance no DeasBank:
   - conexão aceita em um banco espelha no outro;
   - score do parceiro aumenta ou reduz o score local por impacto ponderado;
   - portabilidade usa saldo disponível e trava contra duplicidade;
   - botão para limpar histórico sem revogar conexão ativa.
============================================================================ */
function ofProClampScoreBank(v){ return Math.max(0, Math.min(1000, Math.round(Number(v||0)))); }
function ofProScoreImpactBank(localScore, partnerScore, partnerDebt=0, partnerIncome=0){
    localScore=Number(localScore||500); partnerScore=Number(partnerScore||0); partnerDebt=Number(partnerDebt||0); partnerIncome=Number(partnerIncome||0);
    if(!partnerScore) return ofProClampScoreBank(localScore);
    const scoreDelta=Math.round((partnerScore-localScore)*0.35);
    const debtPenalty=partnerDebt>5000 ? -35 : partnerDebt>2000 ? -18 : partnerDebt>0 ? -6 : 12;
    const incomeBonus=partnerIncome>=5000 ? 18 : partnerIncome>=3000 ? 10 : 0;
    return ofProClampScoreBank(localScore + scoreDelta + debtPenalty + incomeBonus);
}
function ofProInstallClearButtonBank(){
    const tools=document.querySelector('#openFinanceSection .of-list-tools') || document.querySelector('#openFinanceSection .of-filter-tabs') || document.querySelector('#openFinanceSection .section-actions');
    if(!tools) return;
    const existing=document.getElementById('clearOpenFinanceHistoryBankBtn');
    if(existing){ existing.onclick=clearOpenFinanceHistoryBank; return; }
    const btn=document.createElement('button');
    btn.id='clearOpenFinanceHistoryBankBtn'; btn.className='of-filter btn-action'; btn.type='button'; btn.textContent='Limpar histórico';
    btn.onclick=clearOpenFinanceHistoryBank;
    tools.appendChild(btn);
}
async function clearOpenFinanceHistoryBank(){
    if(!deasBankDb) return alert('Firebase não iniciou.');
    const hidden=ofGetHiddenBank();
    let removable=[];
    try{
        const snap=await deasBankDb.collection('openFinanceRequests').get();
        snap.forEach(docSnap=>{
            const r=docSnap.data()||{}; const st=String(r.status||'');
            const mine = r.userId===currentUserId || r.targetUserId===currentUserId || r.bankUserId===currentUserId || r.direction==='enviado' || String(r.emailMasked||'').length>0;
            const alreadyHidden = hidden.includes(docSnap.id) || (Array.isArray(r.hiddenForUsers) && r.hiddenForUsers.includes(currentUserId));
            if(mine && !alreadyHidden && ['connection_denied','data_denied','consent_revoked','data_approved','connection_approved'].includes(st)) removable.push(docSnap);
        });
    }catch(e){
        console.warn('Não deu para buscar histórico na nuvem. Limpando visualmente neste navegador.', e.message);
    }
    const ids=removable.map(d=>d.id);
    for(const docSnap of removable){
        try{ await docSnap.ref.set({hiddenForUsers: firebase.firestore.FieldValue.arrayUnion(currentUserId), hiddenAt: firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); }
        catch(e){ console.warn('Histórico ocultado apenas neste navegador por falta de permissão:', e.message); }
    }
    ofSetHiddenBank(ids);
    alert(ids.length ? `${ids.length} item(ns) removido(s) do histórico. A conexão ativa não foi revogada.` : 'Não havia histórico finalizado para limpar.');
    loadOpenFinanceRequests();
}
async function ofProMirrorBankConnection(request,status,extra={}){
    const approved=['connection_approved','data_pending','data_approved','data_denied'].includes(status);
    const user=ClientRegistry.get(currentUserId) || await loadUserFromFirestore(currentUserId) || {};
    const score=Number(extra.creditScore||extra.sharedScore||user.score||user.scoreOriginal||500);
    const ownerFingerprint=maskEmailForOpenFinance(user.email);
    const localPayload={
        institutionName:'Deas Finance', partnerKey:'deasfinance', connectionMode:'firebase_mutual_openfinance_pro',
        connectionStatus:status, connectionApproved:approved, sameOwner:true, ownerFingerprint,
        partnerRequestId:request.id||request.partnerRequestId||request.requestId||null, sharedScore:score,
        ...extra,
        sharedPayload:{...request,...extra,status,connectionStatus:status,sameOwner:true,sharedScore:score,ownerFingerprint},
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    };
    await deasBankDb.collection('users').doc(currentUserId).collection('openFinanceConnections').doc('deasfinance').set(localPayload,{merge:true});
    if(deasFinanceDb && request.userId){
        await deasFinanceDb.collection('users').doc(request.userId).collection('openFinanceConnections').doc('deasbank').set({
            institutionName:'DeasBank', partnerKey:'deasbank', connectionMode:'firebase_mutual_openfinance_pro',
            connectionStatus:status, connectionApproved:approved, sameOwner:true, ownerFingerprint,
            partnerRequestId:request.id||request.partnerRequestId||request.requestId||null, sharedScore:score,
            sharedPayload:{...request,...extra,status,connectionStatus:status,sameOwner:true,sharedScore:score,ownerFingerprint},
            updatedAt:firebase.firestore.FieldValue.serverTimestamp()
        },{merge:true});
    }
}
async function ofProCreditFinanceDestination(financeUid, amount, moveId){
    amount=Number(amount||0); if(!financeUid || !deasFinanceDb || amount<=0) return {applied:false};
    const safe=String((moveId||'openfinance')+'_destino_deasfinance').replace(/[^a-zA-Z0-9_-]/g,'_');
    const ref=deasFinanceDb.collection('accounts').doc(financeUid); const snap=await ref.get();
    const current=snap.exists ? snap.data() : {balance:0}; const applied=current.openFinanceAppliedMoves||{};
    if(applied[safe]) return {applied:false, duplicated:true};
    const nextBalance=Number(current.balance||0)+amount;
    await ref.set({balance:nextBalance,[`openFinanceAppliedMoves.${safe}`]:true,lastOpenFinanceMoveId:safe,lastOpenFinanceMoveReason:'Portabilidade recebida do DeasBank',updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    try{ await deasFinanceDb.collection('users').doc(financeUid).collection('transactions').add({creditor:'Portabilidade recebida do DeasBank',value:amount,status:'pago',type:'Open Finance',date:new Date().toLocaleDateString('pt-BR'),createdAtText:new Date().toISOString(),createdAt:firebase.firestore.FieldValue.serverTimestamp(),moneyMoveId:safe}); }catch(_){ }
    return {applied:true,nextBalance};
}
const ofProPreviousApproveBank = approveOpenFinanceRequest;
approveOpenFinanceRequest = async function(requestId, requestType=''){
    if(!deasBankDb) return alert('Firebase não iniciou.');
    try{
        const snap=await deasBankDb.collection('openFinanceRequests').doc(requestId).get();
        if(!snap.exists) return alert('Pedido não encontrado.');
        const current={id:requestId,...snap.data()}; const type=requestType||current.requestType;
        if(['data_approved','connection_approved'].includes(current.status)) return alert('Esse pedido já foi aprovado.');
        const user=ClientRegistry.get(currentUserId) || await loadUserFromFirestore(currentUserId) || {};
        const localScore=Number(user.score||calculateWeightedScore(user)||user.scoreOriginal||500);
        const nextStatus=type==='data_transfer_request'?'data_approved':'connection_approved';
        const payload={status:nextStatus,sameOwner:true,connectionApproved:true,sharedScore:localScore,creditScore:localScore,analysisMessage:type==='data_transfer_request'?'Dados financeiros e portabilidade liberados pelo DeasBank.':'Conexão Open Finance aceita pelo DeasBank. A conexão agora vale para os dois bancos.',analyzedAt:firebase.firestore.FieldValue.serverTimestamp()};
        if(type==='connection_request'){
            Object.assign(payload,{externalScore:localScore,relationshipSummary:`Conexão mútua ativa. Score DeasBank compartilhado: ${localScore}.`});
            await ofProMirrorBankConnection(current,nextStatus,payload);
        } else {
            const amount=Number(current.requestedData?.importedSalary||current.requestedData?.requestedSalaryAmount||current.importedSalary||0);
            const available=Number(user.saldo||0);
            if(amount>0 && available<amount) return alert(`Saldo disponível insuficiente no DeasBank para transferir ${formatOpenFinanceMoney(amount)}. Disponível: ${formatOpenFinanceMoney(available)}.`);
            const moveId=current.moneyMoveId||`move_${requestId}`;
            if(amount>0) await applyDeasBankBalanceDeltaOnce(-amount,moveId+'_origem_deasbank','Portabilidade enviada ao Deas Finance');
            const updated=ClientRegistry.get(currentUserId)||user;
            const externalBalance=Number(updated.saldo||0), externalDebt=sumDebts(updated.dividas||[]), externalLimit=Number(updated.limite||0), loansTotal=externalDebt, investmentsTotal=Number(updated.investimentos||0), estimatedIncome=Number(updated.renda||updated.salario||amount||0);
            Object.assign(payload,{importedSalary:amount,transferAmount:amount,moneyMoved:amount>0,moneyMoveId:moveId,transferSourceBank:'DeasBank',transferDestinationBank:current.sourceBank||'Deas Finance',externalBalance,externalDebt,externalLimit,loansTotal,investmentsTotal,creditScore:localScore,externalScore:localScore,estimatedIncome,relationshipSummary:`DeasBank compartilhou salário ${formatOpenFinanceMoney(amount)}, saldo disponível ${formatOpenFinanceMoney(externalBalance)}, dívidas ${formatOpenFinanceMoney(externalDebt)}, limite ${formatOpenFinanceMoney(externalLimit)}, empréstimos ${formatOpenFinanceMoney(loansTotal)}, score ${localScore} e renda ${formatOpenFinanceMoney(estimatedIncome)}.`,requestedData:{importedSalary:amount,requestedSalaryAmount:amount,externalBalance,externalDebt,externalLimit,loansTotal,investmentsTotal,creditScore:localScore,estimatedIncome,requestAllFinancialData:true}});
            if(amount>0 && current.userId){ await ofProCreditFinanceDestination(current.userId,amount,moveId); payload.destinationCredited=true; }
            await ofProMirrorBankConnection(current,nextStatus,payload);
            renderDashboard(ClientRegistry.get(currentUserId)||updated);
        }
        await deasBankDb.collection('openFinanceRequests').doc(requestId).set(payload,{merge:true});
        updateMutualDataVisibility(nextStatus,true); refreshOpenFinanceMirrors();
        alert(type==='data_transfer_request'?'Aprovado. O valor saiu do saldo disponível do DeasBank e entrou no Deas Finance sem duplicidade.':'Conexão aprovada. Agora ela vale nos dois bancos.');
        loadOpenFinanceRequests();
    }catch(error){ alert('Erro ao aceitar: '+error.message); console.error(error); }
};
const ofProPreviousSyncBank = syncDeasFinanceResponse;
syncDeasFinanceResponse = async function(){
    if(!deasBankDb || !deasFinanceDb) return alert('Firebase não iniciou corretamente.');
    try{
        const localRef=deasBankDb.collection('users').doc(currentUserId).collection('openFinanceConnections').doc('deasfinance');
        const localSnap=await localRef.get(); if(!localSnap.exists) return alert('Nenhum pedido enviado ao Deas Finance.');
        const local=localSnap.data(); const requestId=local.dataRequestId||local.partnerRequestId||local.sharedPayload?.partnerRequestId; if(!requestId) return alert('Não encontrei o ID da solicitação.');
        const partnerSnap=await deasFinanceDb.collection('openFinanceRequests').doc(requestId).get(); if(!partnerSnap.exists) return alert('A solicitação ainda não apareceu no Deas Finance.');
        const partner={id:requestId,...partnerSnap.data()}; const status=partner.status||'connection_pending';
        const update={connectionStatus:status,connectionApproved:['connection_approved','data_pending','data_approved','data_denied'].includes(status),sharedPayload:{...(local.sharedPayload||{}),...partner,partnerRequestId:requestId,connectionStatus:status},updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
        const user=ClientRegistry.get(currentUserId) || await loadUserFromFirestore(currentUserId) || {};
        if(status==='connection_approved'){
            const partnerScore=Number(partner.creditScore||partner.sharedScore||partner.externalScore||0);
            const oldScore=Number(user.scoreOriginal||user.score||500);
            if(partnerScore){ user.scoreOriginal=ofProScoreImpactBank(oldScore,partnerScore,0,0); user.lastOpenFinanceScoreImpact=user.scoreOriginal-oldScore; ClientRegistry.insert(currentUserId,user); await persistCurrentUser(); }
            Object.assign(update,{externalScore:partnerScore,sharedScore:partnerScore,relationshipSummary:`Conexão mútua ativa. Score Deas Finance compartilhado: ${partnerScore||'-'}.`});
            await ofProMirrorBankConnection(partner,'connection_approved',update);
            renderDashboard(user);
        }
        if(status==='data_approved'){
            const amount=Number(partner.transferAmount||partner.importedSalary||partner.requestedData?.importedSalary||0);
            const moveId=partner.moneyMoveId||local.moneyMoveId||`move_${requestId}`;
            update.importedSalary=amount; update.externalBalance=Number(partner.externalBalance||partner.requestedData?.externalBalance||0); update.externalDebt=Number(partner.externalDebt||partner.requestedData?.externalDebt||0); update.externalLimit=Number(partner.externalLimit||partner.requestedData?.externalLimit||0); update.externalLoans=Number(partner.loansTotal||partner.requestedData?.loansTotal||0); update.externalInvestments=Number(partner.investmentsTotal||partner.requestedData?.investmentsTotal||0); update.externalScore=Number(partner.creditScore||partner.externalScore||partner.requestedData?.creditScore||0); update.externalIncome=Number(partner.estimatedIncome||partner.requestedData?.estimatedIncome||amount||0); update.relationshipSummary=partner.relationshipSummary||'';
            if(partner.moneyMoved && amount>0){ await applyDeasBankBalanceDeltaOnce(amount,moveId+'_destino_deasbank','Portabilidade recebida do Deas Finance'); update.appliedMoneyMoveId=moveId; update.moneyMovedApplied=true; }
            const latest=ClientRegistry.get(currentUserId)||user; const oldScore=Number(latest.scoreOriginal||latest.score||500); latest.scoreOriginal=ofProScoreImpactBank(oldScore,update.externalScore,update.externalDebt,update.externalIncome); latest.lastOpenFinanceScoreImpact=latest.scoreOriginal-oldScore; latest.limite=Math.max(Number(latest.limite||0),update.externalLimit||0); ClientRegistry.insert(currentUserId,latest); await persistCurrentUser();
            await ofProMirrorBankConnection(partner,'data_approved',update); renderDashboard(latest);
        }
        await localRef.set(update,{merge:true}); updateMutualDataVisibility(status,update.connectionApproved); renderDeasFinanceImportedData({...local,...update}); refreshOpenFinanceMirrors();
        alert(openFinanceStatusLabel(status)); loadOpenFinanceRequests();
    }catch(error){ alert('Erro ao verificar resposta: '+error.message); console.error(error); }
};
const ofProPreviousLoadBank = loadOpenFinanceRequests;
loadOpenFinanceRequests = async function(){ await ofProPreviousLoadBank(); ofProInstallClearButtonBank(); };
ofProInstallClearButtonBank();



/* ===================== HOTFIX V14 - DEASBANK SEM DADOS RECUSADOS PRESO ===================== */
function ofV14ClampScoreBank(v){ return Math.max(0, Math.min(1000, Math.round(Number(v||0)))); }
function ofV14ScoreImpactBank(localScore, partnerScore, partnerDebt=0, partnerIncome=0, partnerBalance=0){
    localScore=Number(localScore||500); partnerScore=Number(partnerScore||0); partnerDebt=Number(partnerDebt||0); partnerIncome=Number(partnerIncome||0); partnerBalance=Number(partnerBalance||0);
    let next=localScore;
    if(partnerScore) next += Math.round((partnerScore-localScore)*0.45);
    const ratio=partnerDebt/Math.max(1,partnerIncome||3000);
    if(partnerDebt>0){ if(ratio>=2.5) next-=95; else if(ratio>=1.2) next-=65; else if(ratio>=.6) next-=35; else next-=12; } else next+=18;
    if(partnerIncome>=7000) next+=35; else if(partnerIncome>=4500) next+=24; else if(partnerIncome>=2500) next+=12; else if(partnerIncome>0 && partnerIncome<1500) next-=16;
    if(partnerBalance>=partnerIncome && partnerIncome>0) next+=14;
    if(partnerBalance<0) next-=30;
    return ofV14ClampScoreBank(next);
}
function ofV14BankSnapshot(user){
    user=user||ClientRegistry.get(currentUserId)||{};
    const debt=sumDebts(user.dividas||[]);
    const score=Number(user.scoreOriginal||calculateWeightedScore(user)||user.score||500);
    const income=Number(user.renda||user.salario||3200);
    const balance=Number(user.saldo||0);
    return {externalBalance:balance,externalDebt:debt,externalLimit:Number(user.limite||0),loansTotal:debt,investmentsTotal:Number(user.investimentos||0),creditScore:score,externalScore:score,sharedScore:score,estimatedIncome:income,relationshipSummary:`DeasBank compartilhou score ${score}, renda ${formatOpenFinanceMoney(income)}, saldo disponível ${formatOpenFinanceMoney(balance)} e dívidas ${formatOpenFinanceMoney(debt)}.`};
}
const ofV14PreviousApproveBank=approveOpenFinanceRequest;
approveOpenFinanceRequest=async function(requestId,requestType=''){
    if(!deasBankDb) return alert('Firebase não iniciou.');
    try{
        const snap=await deasBankDb.collection('openFinanceRequests').doc(requestId).get();
        if(!snap.exists) return alert('Pedido não encontrado.');
        const current={id:requestId,...snap.data()}; const type=requestType||current.requestType;
        if(['data_approved','connection_approved'].includes(current.status)) return alert('Esse pedido já foi aprovado.');
        const user=ClientRegistry.get(currentUserId) || await loadUserFromFirestore(currentUserId) || {};
        const base=ofV14BankSnapshot(user);
        const nextStatus=type==='data_transfer_request'?'data_approved':'connection_approved';
        const payload={status:nextStatus,sameOwner:true,connectionApproved:true,...base,analysisMessage:type==='data_transfer_request'?'Dados financeiros, dívidas, salário e score liberados pelo DeasBank.':'Conexão Open Finance aceita pelo DeasBank. Score, renda e dívidas foram considerados para análise mútua.',analyzedAt:firebase.firestore.FieldValue.serverTimestamp()};
        if(type==='data_transfer_request'){
            const amount=Number(current.requestedData?.importedSalary||current.requestedData?.requestedSalaryAmount||current.importedSalary||0);
            if(amount>0 && Number(user.saldo||0)<amount) return alert(`Saldo disponível insuficiente no DeasBank para transferir ${formatOpenFinanceMoney(amount)}. Disponível: ${formatOpenFinanceMoney(user.saldo||0)}.`);
            const moveId=current.moneyMoveId||`move_${requestId}`;
            if(amount>0) await applyDeasBankBalanceDeltaOnce(-amount,moveId+'_origem_deasbank','Portabilidade enviada ao Deas Finance');
            const updated=ClientRegistry.get(currentUserId)||user;
            Object.assign(payload,ofV14BankSnapshot(updated),{importedSalary:amount,transferAmount:amount,moneyMoved:amount>0,moneyMoveId:moveId,transferSourceBank:'DeasBank',transferDestinationBank:current.sourceBank||'Deas Finance'});
            payload.requestedData={importedSalary:amount,requestedSalaryAmount:amount,externalBalance:payload.externalBalance,externalDebt:payload.externalDebt,externalLimit:payload.externalLimit,loansTotal:payload.loansTotal,investmentsTotal:payload.investmentsTotal,creditScore:payload.creditScore,estimatedIncome:payload.estimatedIncome,requestAllFinancialData:true,relationshipSummary:payload.relationshipSummary};
            if(amount>0 && current.userId){ await ofProCreditFinanceDestination(current.userId,amount,moveId); payload.destinationCredited=true; }
        }
        await deasBankDb.collection('openFinanceRequests').doc(requestId).set(payload,{merge:true});
        await ofProMirrorBankConnection(current,nextStatus,payload);
        updateMutualDataVisibility(nextStatus,true); refreshOpenFinanceMirrors();
        alert(type==='data_transfer_request'?'Aprovado. Dados e salário enviados para análise do Deas Finance.':'Conexão aprovada. Score, renda e dívidas já foram compartilhados para análise mútua.');
        loadOpenFinanceRequests();
    }catch(error){ alert('Erro ao aceitar: '+error.message); console.error(error); }
};
function ofV14PickBankRequestId(local={}){
    const status=String(local.connectionStatus||local.sharedPayload?.connectionStatus||local.sharedPayload?.status||'');
    if(status==='data_pending' && local.dataRequestId) return local.dataRequestId;
    return local.partnerRequestId || local.sharedPayload?.partnerRequestId || local.dataRequestId;
}
syncDeasFinanceResponse=async function(){
    if(!deasBankDb || !deasFinanceDb) return alert('Firebase não iniciou corretamente.');
    try{
        const localRef=deasBankDb.collection('users').doc(currentUserId).collection('openFinanceConnections').doc('deasfinance');
        const localSnap=await localRef.get(); if(!localSnap.exists) return alert('Nenhum pedido enviado ao Deas Finance.');
        const local=localSnap.data(); const requestId=ofV14PickBankRequestId(local); if(!requestId) return alert('Não encontrei o ID da solicitação.');
        const partnerSnap=await deasFinanceDb.collection('openFinanceRequests').doc(requestId).get(); if(!partnerSnap.exists) return alert('A solicitação ainda não apareceu no Deas Finance.');
        const partner={id:requestId,...partnerSnap.data()}; const status=partner.status||'connection_pending';
        const update={connectionStatus:status,connectionApproved:['connection_approved','data_pending','data_approved','data_denied'].includes(status),sharedPayload:{...(local.sharedPayload||{}),...partner,partnerRequestId:requestId,connectionStatus:status},updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
        const user=ClientRegistry.get(currentUserId) || await loadUserFromFirestore(currentUserId) || {};
        const partnerScore=Number(partner.creditScore||partner.sharedScore||partner.externalScore||partner.requestedData?.creditScore||0);
        const partnerDebt=Number(partner.externalDebt||partner.requestedData?.externalDebt||0);
        const partnerIncome=Number(partner.estimatedIncome||partner.requestedData?.estimatedIncome||partner.importedSalary||0);
        const partnerBalance=Number(partner.externalBalance||partner.requestedData?.externalBalance||0);
        if(status==='connection_approved'){
            const oldScore=Number(user.scoreOriginal||user.score||500);
            if(partnerScore){ user.scoreOriginal=ofV14ScoreImpactBank(oldScore,partnerScore,partnerDebt,partnerIncome,partnerBalance); user.lastOpenFinanceScoreImpact=user.scoreOriginal-oldScore; ClientRegistry.insert(currentUserId,user); await persistCurrentUser(); }
            Object.assign(update,{externalScore:partnerScore,sharedScore:partnerScore,externalDebt:partnerDebt,externalIncome:partnerIncome,externalBalance:partnerBalance,relationshipSummary:`Conexão mútua ativa. Score ${partnerScore||'-'}, renda ${formatOpenFinanceMoney(partnerIncome||0)} e dívidas ${formatOpenFinanceMoney(partnerDebt||0)} considerados no DeasBank.`});
            await ofProMirrorBankConnection(partner,'connection_approved',update); renderDashboard(user);
        } else if(status==='data_approved'){
            const amount=Number(partner.transferAmount||partner.importedSalary||partner.requestedData?.importedSalary||0);
            const moveId=partner.moneyMoveId||local.moneyMoveId||`move_${requestId}`;
            Object.assign(update,{importedSalary:amount,externalBalance:partnerBalance,externalDebt:partnerDebt,externalLimit:Number(partner.externalLimit||partner.requestedData?.externalLimit||0),externalLoans:Number(partner.loansTotal||partner.requestedData?.loansTotal||0),externalInvestments:Number(partner.investmentsTotal||partner.requestedData?.investmentsTotal||0),externalScore:partnerScore,externalIncome:partnerIncome,relationshipSummary:partner.relationshipSummary||''});
            if(partner.moneyMoved && amount>0){ await applyDeasBankBalanceDeltaOnce(amount,moveId+'_destino_deasbank','Portabilidade recebida do Deas Finance'); update.appliedMoneyMoveId=moveId; update.moneyMovedApplied=true; }
            const latest=ClientRegistry.get(currentUserId)||user; const oldScore=Number(latest.scoreOriginal||latest.score||500); latest.scoreOriginal=ofV14ScoreImpactBank(oldScore,partnerScore,partnerDebt,partnerIncome,partnerBalance); latest.lastOpenFinanceScoreImpact=latest.scoreOriginal-oldScore; latest.limite=Math.max(Number(latest.limite||0),update.externalLimit||0); ClientRegistry.insert(currentUserId,latest); await persistCurrentUser();
            await ofProMirrorBankConnection(partner,'data_approved',update); renderDashboard(latest);
        } else if(status==='data_denied'){
            Object.assign(update,{connectionStatus:'connection_approved',connectionApproved:true,lastDataStatus:'data_denied',sharedPayload:{...update.sharedPayload,lastDataStatus:'data_denied',connectionStatus:'connection_approved'}});
            await ofProMirrorBankConnection(partner,'connection_approved',update);
            alert('O Deas Finance recusou esse pedido de dados, mas a conexão continua ativa. Você pode solicitar novamente.');
        } else if(status==='connection_denied' || status==='consent_revoked'){
            update.connectionApproved=false;
        }
        await localRef.set(update,{merge:true}); updateMutualDataVisibility(update.connectionStatus,update.connectionApproved); renderDeasFinanceImportedData({...local,...update}); refreshOpenFinanceMirrors();
        if(status!=='data_denied') alert(openFinanceStatusLabel(update.connectionStatus));
        loadOpenFinanceRequests();
    }catch(error){ alert('Erro ao verificar resposta: '+error.message); console.error(error); }
};
const ofV14OldRenderBankData=renderDeasFinanceImportedData;
renderDeasFinanceImportedData=function(local={}){
    if(String(local.connectionStatus||local.sharedPayload?.connectionStatus||local.sharedPayload?.status||'')==='data_denied'){
        local={...local,connectionStatus:'connection_approved',lastDataStatus:'data_denied',sharedPayload:{...(local.sharedPayload||{}),connectionStatus:'connection_approved',lastDataStatus:'data_denied'}};
    }
    ofV14OldRenderBankData(local);
};



/* ===================== HOTFIX V15 - SCORE UNIFICADO + CONEXAO MAIS ESTAVEL ===================== */
function ofV15ClampScoreBank(v){ return Math.max(0, Math.min(1000, Math.round(Number(v || 0)))); }
function ofV15SumDebtsBank(dividas=[]){ return (dividas || []).reduce((sum, d) => sum + Number(d?.valor || 0), 0); }
function ofV15BankLocalSnapshot(user={}){
    const baseScore = Number(user.openFinanceMutualScore || user.scoreOriginal || user.score || 500);
    return {
        creditScore: baseScore,
        externalScore: baseScore,
        sharedScore: baseScore,
        externalBalance: Number(user.saldo || 0),
        externalDebt: ofV15SumDebtsBank(user.dividas || []),
        externalLimit: Number(user.limite || 0),
        loansTotal: ofV15SumDebtsBank(user.dividas || []),
        investmentsTotal: Number(user.investimentos || 0),
        estimatedIncome: Number(user.renda || user.salario || 3200)
    };
}
function ofV15PartnerSnapshotFromRequest(req={}){
    const d = req.requestedData || {};
    return {
        creditScore: Number(req.mutualScore || req.creditScore || req.externalScore || req.sharedScore || d.creditScore || 0),
        externalBalance: Number(req.externalBalance || d.externalBalance || 0),
        externalDebt: Number(req.externalDebt || d.externalDebt || 0),
        externalLimit: Number(req.externalLimit || d.externalLimit || 0),
        loansTotal: Number(req.loansTotal || d.loansTotal || 0),
        investmentsTotal: Number(req.investmentsTotal || d.investmentsTotal || 0),
        estimatedIncome: Number(req.estimatedIncome || d.estimatedIncome || req.importedSalary || d.importedSalary || 0)
    };
}
function ofV15UnifiedMutualScoreBank(localSnapshot={}, partnerSnapshot={}){
    const localScore = Number(localSnapshot.creditScore || 500);
    const partnerScore = Number(partnerSnapshot.creditScore || 0);
    let next = partnerScore > 0 ? Math.round((localScore + partnerScore) / 2) : localScore;
    const totalDebt = Number(localSnapshot.externalDebt || 0) + Number(partnerSnapshot.externalDebt || 0);
    const totalIncome = Number(localSnapshot.estimatedIncome || 0) + Number(partnerSnapshot.estimatedIncome || 0);
    const totalBalance = Number(localSnapshot.externalBalance || 0) + Number(partnerSnapshot.externalBalance || 0);
    const debtRatio = totalDebt / Math.max(1000, totalIncome || 3000);

    if (debtRatio >= 1.8) next -= 110;
    else if (debtRatio >= 1.1) next -= 70;
    else if (debtRatio >= 0.65) next -= 35;
    else if (totalDebt > 0) next -= 10;
    else next += 12;

    if (totalIncome >= 12000) next += 45;
    else if (totalIncome >= 8000) next += 28;
    else if (totalIncome >= 4500) next += 16;
    else if (totalIncome > 0 && totalIncome < 2500) next -= 18;

    if (totalBalance >= Math.max(1500, totalIncome * 0.5)) next += 18;
    else if (totalBalance < 0) next -= 25;

    return ofV15ClampScoreBank(next);
}
function calculateWeightedScore(user={}) {
    if (user && Number(user.openFinanceMutualScore || 0) > 0) {
        return ofV15ClampScoreBank(user.openFinanceMutualScore);
    }
    const PESO_POR_PENDENCIA = 30;
    const PESO_VALOR_DIVIDA = 0.05;
    const PENALIDADE_INTERNA = 1.5;
    let deducaoTotal = 0;
    (user.dividas || []).forEach(divida => {
        const multiplicador = divida.empresa === 'DEASBank' ? PENALIDADE_INTERNA : 1.0;
        deducaoTotal += (PESO_POR_PENDENCIA + (Number(divida.valor || 0) * PESO_VALOR_DIVIDA)) * multiplicador;
    });
    return Math.max(0, Math.floor(Number(user.scoreOriginal || 500) - deducaoTotal));
}
async function ofV15PersistBankMutualScore(user, mutualScore, note=''){
    if (!user || !currentUserId) return user;
    user.openFinanceMutualScore = mutualScore;
    user.scoreOriginal = mutualScore;
    user.score = mutualScore;
    user.lastOpenFinanceScoreImpact = mutualScore - Number(user.score || user.scoreOriginal || 500);
    if (note) user.lastOpenFinanceNote = note;
    ClientRegistry.insert(currentUserId, user);
    await persistCurrentUser();
    renderDashboard(user);
    return user;
}
async function requestDeasFinanceConnection() {
    if (!currentUserId || !deasBankDb) return alert('Entre na conta e confira o Firebase.');
    try {
        const user = ClientRegistry.get(currentUserId) || await loadUserFromFirestore(currentUserId) || {};
        const snap = ofV15BankLocalSnapshot(user);
        const payload = {
            consentId: `consent_bank_${currentUserId}_${Date.now()}`,
            sourceBank: 'DeasBank',
            partnerBank: 'Deas Finance',
            userId: currentUserId,
            userName: user.nome || user.name || 'Cliente DeasBank',
            emailMasked: String(user.email || '').replace(/(^...).*(@.*$)/, '$1***$2'),
            purpose: 'solicitacao_conexao_open_finance',
            requestType: 'connection_request',
            sameOwner: true,
            status: 'connection_pending',
            createdAtText: new Date().toISOString(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...snap,
            relationshipSummary: `DeasBank iniciou a conexão compartilhando score ${snap.creditScore}, renda ${formatOpenFinanceMoney(snap.estimatedIncome)}, saldo disponível ${formatOpenFinanceMoney(snap.externalBalance)} e dívidas ${formatOpenFinanceMoney(snap.externalDebt)}.`
        };
        const ref = await deasFinanceDb.collection('openFinanceRequests').add(payload);
        await deasBankDb.collection('users').doc(currentUserId).collection('openFinanceConnections').doc('deasfinance').set({
            institutionName: 'Deas Finance',
            partnerKey: 'deasfinance',
            connectionMode: 'firebase_openfinance',
            partnerRequestId: ref.id,
            connectionStatus: 'connection_pending',
            connectionApproved: false,
            sameOwner: true,
            connectedAt: new Date().toLocaleDateString('pt-BR'),
            createdAtText: new Date().toISOString(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            sharedPayload: { ...payload, partnerRequestId: ref.id }
        }, { merge: true });
        updateMutualDataVisibility('connection_pending', false);
        alert('Solicitação de conexão enviada ao Deas Finance.');
        loadOpenFinanceRequests();
    } catch (error) {
        alert('Erro ao pedir conexão: ' + error.message);
        console.error(error);
    }
}
approveOpenFinanceRequest = async function(requestId, requestType='') {
    if (!deasBankDb) return alert('Firebase não iniciou.');
    try {
        const snap = await deasBankDb.collection('openFinanceRequests').doc(requestId).get();
        if (!snap.exists) return alert('Pedido não encontrado.');
        const current = { id: requestId, ...snap.data() };
        const type = requestType || current.requestType;
        if (['data_approved', 'connection_approved'].includes(current.status)) return alert('Esse pedido já foi aprovado.');
        const user = ClientRegistry.get(currentUserId) || await loadUserFromFirestore(currentUserId) || {};
        const localSnapshot = ofV15BankLocalSnapshot(user);
        const partnerSnapshot = ofV15PartnerSnapshotFromRequest(current);
        const mutualScore = ofV15UnifiedMutualScoreBank(localSnapshot, partnerSnapshot);
        const nextStatus = type === 'data_transfer_request' ? 'data_approved' : 'connection_approved';
        const payload = {
            status: nextStatus,
            sameOwner: true,
            connectionApproved: true,
            mutualScore,
            sharedScore: mutualScore,
            creditScore: mutualScore,
            externalScore: mutualScore,
            analysisMessage: type === 'data_transfer_request'
                ? 'Dados financeiros, salário, dívidas e score liberados pelo DeasBank com score unificado entre os dois bancos.'
                : 'Conexão Open Finance aceita pelo DeasBank com score unificado entre os dois bancos.',
            analyzedAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...localSnapshot,
            relationshipSummary: `Conexão mútua ativa. Score unificado ${mutualScore}, renda ${formatOpenFinanceMoney(localSnapshot.estimatedIncome)}, saldo disponível ${formatOpenFinanceMoney(localSnapshot.externalBalance)} e dívidas ${formatOpenFinanceMoney(localSnapshot.externalDebt)}.`
        };

        if (type === 'data_transfer_request') {
            const amount = Number(current.requestedData?.importedSalary || current.requestedData?.requestedSalaryAmount || current.importedSalary || 0);
            if (amount > 0 && Number(user.saldo || 0) < amount) {
                return alert(`Saldo disponível insuficiente no DeasBank para transferir ${formatOpenFinanceMoney(amount)}. Disponível: ${formatOpenFinanceMoney(user.saldo || 0)}.`);
            }
            const moveId = current.moneyMoveId || `move_${requestId}`;
            if (amount > 0) await applyDeasBankBalanceDeltaOnce(-amount, moveId + '_origem_deasbank', 'Portabilidade enviada ao Deas Finance');
            const updatedUser = ClientRegistry.get(currentUserId) || user;
            const updatedSnapshot = ofV15BankLocalSnapshot(updatedUser);
            Object.assign(payload, updatedSnapshot, {
                importedSalary: amount,
                transferAmount: amount,
                moneyMoved: amount > 0,
                moneyMoveId: moveId,
                transferSourceBank: 'DeasBank',
                transferDestinationBank: current.sourceBank || 'Deas Finance',
                mutualScore,
                sharedScore: mutualScore,
                creditScore: mutualScore,
                externalScore: mutualScore,
                relationshipSummary: `DeasBank compartilhou salário ${formatOpenFinanceMoney(amount)}, saldo disponível ${formatOpenFinanceMoney(updatedSnapshot.externalBalance)}, dívidas ${formatOpenFinanceMoney(updatedSnapshot.externalDebt)}, limite ${formatOpenFinanceMoney(updatedSnapshot.externalLimit)} e score unificado ${mutualScore}.`
            });
            payload.requestedData = {
                importedSalary: amount,
                requestedSalaryAmount: amount,
                externalBalance: payload.externalBalance,
                externalDebt: payload.externalDebt,
                externalLimit: payload.externalLimit,
                loansTotal: payload.loansTotal,
                investmentsTotal: payload.investmentsTotal,
                creditScore: mutualScore,
                estimatedIncome: payload.estimatedIncome,
                requestAllFinancialData: true,
                relationshipSummary: payload.relationshipSummary
            };
            if (amount > 0 && current.userId) {
                await ofProCreditFinanceDestination(current.userId, amount, moveId);
                payload.destinationCredited = true;
            }
        }

        await ofV15PersistBankMutualScore(user, mutualScore, 'Score unificado após aprovação Open Finance');
        await deasBankDb.collection('openFinanceRequests').doc(requestId).set(payload, { merge: true });
        await ofProMirrorBankConnection(current, nextStatus, payload);
        updateMutualDataVisibility(nextStatus, true);
        refreshOpenFinanceMirrors();
        alert(type === 'data_transfer_request'
            ? `Aprovado. Score dos dois bancos foi alinhado para ${mutualScore}.`
            : `Conexão aprovada. Score dos dois bancos foi alinhado para ${mutualScore}.`);
        loadOpenFinanceRequests();
    } catch (error) {
        alert('Erro ao aceitar: ' + error.message);
        console.error(error);
    }
};
syncDeasFinanceResponse = async function() {
    if (!deasBankDb || !deasFinanceDb) return alert('Firebase não iniciou corretamente.');
    try {
        const localRef = deasBankDb.collection('users').doc(currentUserId).collection('openFinanceConnections').doc('deasfinance');
        const localSnap = await localRef.get();
        if (!localSnap.exists) return alert('Nenhum pedido enviado ao Deas Finance.');
        const local = localSnap.data();
        const requestId = ofV14PickBankRequestId(local);
        if (!requestId) return alert('Não encontrei o ID da solicitação.');
        const partnerSnap = await deasFinanceDb.collection('openFinanceRequests').doc(requestId).get();
        if (!partnerSnap.exists) return alert('A solicitação ainda não apareceu no Deas Finance.');
        const partner = { id: requestId, ...partnerSnap.data() };
        const rawStatus = String(partner.status || 'connection_pending');
        const effectiveStatus = rawStatus === 'data_denied' ? 'connection_approved' : rawStatus;
        const update = {
            connectionStatus: effectiveStatus,
            connectionApproved: ['connection_approved', 'data_pending', 'data_approved'].includes(effectiveStatus),
            lastDataStatus: rawStatus === 'data_denied' ? 'data_denied' : (local.lastDataStatus || null),
            sharedPayload: { ...(local.sharedPayload || {}), ...partner, partnerRequestId: requestId, connectionStatus: effectiveStatus },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const user = ClientRegistry.get(currentUserId) || await loadUserFromFirestore(currentUserId) || {};
        const localSnapshot = ofV15BankLocalSnapshot(user);
        const partnerSnapshot = ofV15PartnerSnapshotFromRequest(partner);
        const mutualScore = Number(partner.mutualScore || ofV15UnifiedMutualScoreBank(localSnapshot, partnerSnapshot));
        Object.assign(update, {
            mutualScore,
            sharedScore: mutualScore,
            externalScore: Number(partnerSnapshot.creditScore || 0),
            externalDebt: Number(partnerSnapshot.externalDebt || 0),
            externalIncome: Number(partnerSnapshot.estimatedIncome || 0),
            externalBalance: Number(partnerSnapshot.externalBalance || 0),
            relationshipSummary: partner.relationshipSummary || `Conexão mútua ativa. Score unificado ${mutualScore}.`
        });
        if (rawStatus === 'data_approved') {
            const amount = Number(partner.transferAmount || partner.importedSalary || partner.requestedData?.importedSalary || 0);
            const moveId = partner.moneyMoveId || local.moneyMoveId || `move_${requestId}`;
            Object.assign(update, {
                importedSalary: amount,
                externalLimit: Number(partner.externalLimit || partner.requestedData?.externalLimit || 0),
                externalLoans: Number(partner.loansTotal || partner.requestedData?.loansTotal || 0),
                externalInvestments: Number(partner.investmentsTotal || partner.requestedData?.investmentsTotal || 0)
            });
            if (partner.moneyMoved && amount > 0) {
                await applyDeasBankBalanceDeltaOnce(amount, moveId + '_destino_deasbank', 'Portabilidade recebida do Deas Finance');
                update.appliedMoneyMoveId = moveId;
                update.moneyMovedApplied = true;
            }
        }
        await ofV15PersistBankMutualScore(user, mutualScore, 'Score unificado após sincronizar Open Finance');
        await localRef.set(update, { merge: true });
        await ofProMirrorBankConnection(partner, effectiveStatus, update);
        updateMutualDataVisibility(update.connectionStatus, update.connectionApproved);
        renderDeasFinanceImportedData({ ...local, ...update });
        refreshOpenFinanceMirrors();
        if (rawStatus === 'data_denied') {
            alert('O Deas Finance recusou esse pedido de dados, mas a conexão continua ativa. Você pode solicitar novamente.');
        } else {
            alert(`Sincronização concluída. Score unificado atual: ${mutualScore}.`);
        }
        loadOpenFinanceRequests();
    } catch (error) {
        alert('Erro ao verificar resposta: ' + error.message);
        console.error(error);
    }
};


/* ===================== HOTFIX V16 - PAGAR DIVIDA COM SALDO DISPONIVEL ===================== */
async function payDebt(index) {
    const user = ClientRegistry.get(currentUserId);
    if (!user || !Array.isArray(user.dividas) || !user.dividas[index]) return alert('Dívida não encontrada.');
    const divida = user.dividas[index];
    const valor = Number(divida.valor || 0);
    const saldoDisponivel = Number(user.saldo || 0);
    const limiteDisponivel = Number(user.limite || 0);
    const totalDisponivel = saldoDisponivel + limiteDisponivel;

    if (totalDisponivel < valor) {
        alert(`Saldo insuficiente. Você tem ${formatOpenFinanceMoney(saldoDisponivel)} em saldo disponível e ${formatOpenFinanceMoney(limiteDisponivel)} em limite.`);
        return;
    }

    const usaSaldo = Math.min(saldoDisponivel, valor);
    const usaLimite = valor - usaSaldo;
    const textoFonte = usaLimite > 0
        ? `${formatOpenFinanceMoney(usaSaldo)} do saldo disponível + ${formatOpenFinanceMoney(usaLimite)} do limite`
        : `${formatOpenFinanceMoney(usaSaldo)} do saldo disponível`;

    if (!confirm(`Confirmar pagamento de ${formatOpenFinanceMoney(valor)} para ${divida.empresa}?\n\nSerá usado: ${textoFonte}.`)) return;

    user.saldo = saldoDisponivel - usaSaldo;
    user.limite = limiteDisponivel - usaLimite;
    user.dividas.splice(index, 1);
    user.ultimaFormaPagamentoDivida = usaLimite > 0 ? 'saldo_e_limite' : 'saldo_disponivel';
    user.lastDebtPaymentDescription = `Pagamento de ${formatOpenFinanceMoney(valor)} usando ${textoFonte}.`;

    renderDashboard(user);
    await persistCurrentUser();
    alert(`Dívida paga com sucesso usando ${textoFonte}.`);
}


/* ===================== HOTFIX V18 - DEASBANK TAMBEM TRAZ SALARIO DO DEAS FINANCE ===================== */
function ofV18SetBringSalaryButtons(status, connectionApproved = false) {
    const normalized = String(status || '');
    const hasApprovedConnection = connectionApproved === true || ['connection_approved', 'data_pending', 'data_approved', 'data_denied'].includes(normalized);
    const canBringSalary = hasApprovedConnection && ['connection_approved', 'data_approved', 'data_denied'].includes(normalized);
    ['requestDeasFinanceDataCard', 'bringSalaryHeaderBtn', 'bringSalaryHelper'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !canBringSalary);
    });
    const btn = document.getElementById('requestDeasFinanceDataCard');
    if (btn) btn.textContent = 'Trazer salário';
    const headerBtn = document.getElementById('bringSalaryHeaderBtn');
    if (headerBtn) headerBtn.textContent = 'Trazer salário';
}
const ofV18PreviousUpdateVisibility = updateMutualDataVisibility;
updateMutualDataVisibility = function(connectionStatus, connectionApproved = false) {
    if (typeof ofV18PreviousUpdateVisibility === 'function') {
        ofV18PreviousUpdateVisibility(connectionStatus, connectionApproved);
    }
    ofV18SetBringSalaryButtons(connectionStatus, connectionApproved);
};
const ofV18PreviousRequestSalary = requestDeasFinanceData;
requestDeasFinanceData = async function() {
    if (!deasBankDb || !deasFinanceDb) return alert('Firebase não iniciou corretamente.');
    const user = ClientRegistry.get(currentUserId);
    if (!user) return alert('Entre na sua conta primeiro.');
    try {
        const localRef = deasBankDb.collection('users').doc(currentUserId).collection('openFinanceConnections').doc('deasfinance');
        const localSnap = await localRef.get();
        const local = localSnap.exists ? localSnap.data() : null;
        const status = String(local?.connectionStatus || local?.sharedPayload?.connectionStatus || local?.sharedPayload?.status || '');
        const approved = local?.connectionApproved === true || ['connection_approved', 'data_approved', 'data_denied'].includes(status);
        if (!local || !approved) {
            alert('Primeiro solicite a conexão e aguarde o Deas Finance aceitar.');
            return;
        }
        const suggestion = Number(local.importedSalary || local.requestedSalary || user.renda || user.salario || 3200) || 3200;
        const requestedSalary = Number(prompt('Quanto de salário deseja trazer do Deas Finance para o DeasBank?', String(suggestion)) || 0);
        if (requestedSalary <= 0) return alert('Informe um valor válido para trazer salário.');
        const moveId = `move_deasfinance_to_deasbank_${currentUserId}_${Date.now()}`;
        const payload = {
            consentId: `deasbank_salary_${currentUserId}_${Date.now()}`,
            moneyMoveId: moveId,
            sourceBank: 'DeasBank',
            partnerBank: 'Deas Finance',
            userId: currentUserId,
            userName: user.nome || user.name || 'Cliente DeasBank',
            emailMasked: maskEmailForOpenFinance(user.email),
            purpose: 'trazer_salario_do_deas_finance',
            requestType: 'data_transfer_request',
            sameOwner: true,
            permissions: { income: true, balance: true, debts: true, creditLimit: true, loans: true, score: true, salaryPortability: true },
            requestedData: {
                importedSalary: requestedSalary,
                requestedSalaryAmount: requestedSalary,
                requestAllFinancialData: true,
                salaryPortability: true
            },
            importedSalary: requestedSalary,
            status: 'data_pending',
            direction: 'salary_from_deasfinance_to_deasbank',
            createdAtText: new Date().toISOString(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const ref = await deasFinanceDb.collection('openFinanceRequests').add(payload);
        await localRef.set({
            dataRequestId: ref.id,
            connectionStatus: 'data_pending',
            connectionApproved: true,
            moneyMoveId: moveId,
            requestedSalary,
            lastSalaryRequestDirection: 'deasfinance_to_deasbank',
            sharedPayload: { ...payload, partnerRequestId: ref.id, connectionStatus: 'data_pending' },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        updateMutualDataVisibility('data_pending', true);
        alert('Pedido para trazer salário enviado ao Deas Finance. Depois que ele aceitar, clique em “Sincronizar respostas”.');
        loadOpenFinanceRequests();
    } catch (error) {
        alert('Erro ao trazer salário: ' + error.message);
        console.error(error);
    }
};


/* ===================== V19 - LAYOUT, SCORE DINAMICO, HISTORICO E PAGAMENTO ===================== */
function v19ClampScoreBank(value) {
    return Math.max(0, Math.min(1000, Math.round(Number(value || 0))));
}

function v19BankDebtTotal(user = {}) {
    return (user.dividas || []).reduce((total, item) => total + Number(item.valor || 0), 0);
}

function v19BankScoreBase(user = {}) {
    return Number(user.openFinanceScoreBase || user.openFinanceMutualScore || user.scoreOriginal || user.score || 500);
}

function v19BankDynamicScore(user = {}) {
    const base = v19BankScoreBase(user);
    const debt = v19BankDebtTotal(user);
    const balance = Number(user.saldo || 0);
    const income = Number(user.renda || user.salario || user.estimatedIncome || 3200);
    const debtCount = (user.dividas || []).length;
    const debtRatio = debt / Math.max(1000, income || 3200);
    let next = base;

    if (debtCount > 0) {
        next -= debtCount * 18;
    }

    if (debtRatio >= 2) {
        next -= 120;
    } else if (debtRatio >= 1.2) {
        next -= 80;
    } else if (debtRatio >= 0.65) {
        next -= 45;
    } else if (debt > 0) {
        next -= 18;
    } else {
        next += 18;
    }

    if (balance >= income && income > 0) {
        next += 25;
    } else if (balance >= income * 0.5 && income > 0) {
        next += 12;
    } else if (balance < 0) {
        next -= 30;
    }

    return v19ClampScoreBank(next);
}

calculateWeightedScore = function(user = {}) {
    return v19BankDynamicScore(user);
};

function v19RecalculateAndStoreBankScore(user = {}) {
    if (!user.openFinanceScoreBase) {
        user.openFinanceScoreBase = Number(user.openFinanceMutualScore || user.scoreOriginal || user.score || 500);
    }

    user.score = v19BankDynamicScore(user);
    user.lastScoreUpdatedAt = new Date().toISOString();
    return user;
}

async function v19PersistAndRenderBank(user = {}) {
    v19RecalculateAndStoreBankScore(user);
    ClientRegistry.insert(currentUserId, user);
    renderDashboard(user);
    await persistCurrentUser();
}

payDebt = async function(index) {
    const user = ClientRegistry.get(currentUserId);

    if (!user || !Array.isArray(user.dividas) || !user.dividas[index]) {
        alert("Dívida não encontrada.");
        return;
    }

    const divida = user.dividas[index];
    const valor = Number(divida.valor || 0);
    const saldoDisponivel = Number(user.saldo || 0);
    const limiteDisponivel = Number(user.limite || 0);
    const totalDisponivel = saldoDisponivel + limiteDisponivel;

    if (totalDisponivel < valor) {
        alert(`Saldo insuficiente. Você tem ${formatOpenFinanceMoney(totalDisponivel)} somando saldo disponível e limite.`);
        return;
    }

    const usaSaldo = Math.min(saldoDisponivel, valor);
    const usaLimite = Math.max(0, valor - usaSaldo);
    const mensagem = usaLimite > 0
        ? `Confirmar pagamento de ${formatOpenFinanceMoney(valor)}?\n\nSerá usado ${formatOpenFinanceMoney(usaSaldo)} do saldo disponível e ${formatOpenFinanceMoney(usaLimite)} do limite.`
        : `Confirmar pagamento de ${formatOpenFinanceMoney(valor)} usando seu saldo disponível?`;

    if (!confirm(mensagem)) {
        return;
    }

    user.saldo = saldoDisponivel - usaSaldo;
    user.limite = limiteDisponivel - usaLimite;
    user.dividas.splice(index, 1);

    await v19PersistAndRenderBank(user);

    alert("Dívida paga. Seu score foi recalculado com a dívida removida.");
};

takeLoan = async function() {
    const user = ClientRegistry.get(currentUserId);

    if (!user) {
        alert("Usuário não encontrado.");
        return;
    }

    v19RecalculateAndStoreBankScore(user);

    const limiteMaximo = 5000;
    const totalContratado = (user.dividas || [])
        .filter(item => item.empresa === "DEASBank")
        .reduce((total, item) => total + Number(item.valor || 0), 0);

    if (user.score < 450) {
        alert("Empréstimo negado: risco de crédito elevado para o perfil atual.");
        return;
    }

    if (totalContratado + 1000 > limiteMaximo) {
        alert("Você atingiu o limite máximo de contratos com o banco.");
        return;
    }

    const dataVenc = new Date();
    dataVenc.setDate(dataVenc.getDate() + 30);

    user.dividas.push({
        empresa: "DEASBank",
        vencimento: dataVenc.toISOString().split("T")[0],
        valor: 1000.00
    });

    user.saldo = Number(user.saldo || 0) + 1000;
    await v19PersistAndRenderBank(user);

    alert("Empréstimo liberado. O saldo aumentou, a dívida entrou no histórico e o score foi recalculado.");
};

requestLimitIncrease = async function() {
    const user = ClientRegistry.get(currentUserId);

    if (!user) {
        alert("Usuário não encontrado.");
        return;
    }

    v19RecalculateAndStoreBankScore(user);

    const totalDividas = v19BankDebtTotal(user);

    if (totalDividas > (Number(user.limite || 0) * 0.35)) {
        alert("Aumento negado: comprometimento financeiro muito alto.");
        await v19PersistAndRenderBank(user);
        return;
    }

    if (user.score >= 760) {
        user.limite = Number(user.limite || 0) + 1000;
        alert("Aumento de R$ 1.000,00 aprovado.");
    } else if (user.score >= 580) {
        user.limite = Number(user.limite || 0) + 300;
        alert("Aumento parcial de R$ 300,00 aprovado.");
    } else {
        alert("Aumento negado por score baixo.");
    }

    await v19PersistAndRenderBank(user);
};

clearOpenFinanceHistoryBank = async function() {
    if (!deasBankDb) {
        return alert("Firebase não iniciou.");
    }

    let ids = [];

    try {
        const snap = await deasBankDb.collection("openFinanceRequests").get();

        snap.forEach(docSnap => {
            const item = docSnap.data() || {};
            const belongsToUser = item.userId === currentUserId
                || item.targetUserId === currentUserId
                || item.bankUserId === currentUserId
                || item.sourceUserId === currentUserId
                || String(item.sourceBank || "").toLowerCase().includes("deas")
                || String(item.partnerBank || "").toLowerCase().includes("deas");

            if (belongsToUser) {
                ids.push(docSnap.id);
            }
        });

        for (const id of ids) {
            try {
                await deasBankDb.collection("openFinanceRequests").doc(id).set({
                    hiddenForUsers: firebase.firestore.FieldValue.arrayUnion(currentUserId),
                    hiddenAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.warn("Histórico ocultado apenas neste navegador:", error.message);
            }
        }
    } catch (error) {
        console.warn("Não foi possível limpar na nuvem. Limpando visualmente neste navegador:", error.message);
    }

    ofSetHiddenBank(ids);

    const box = document.getElementById("openFinanceCards");

    if (box) {
        box.innerHTML = '<div class="of-empty-state">Histórico limpo. Novas solicitações aparecerão aqui quando forem criadas.</div>';
    }

    alert(ids.length ? `${ids.length} item(ns) removido(s) da tela do Open Finance.` : "Histórico limpo neste navegador.");
    loadOpenFinanceRequests();
};

const v19PreviousRenderDashboard = renderDashboard;
renderDashboard = function(user) {
    if (user) {
        v19RecalculateAndStoreBankScore(user);
    }

    v19PreviousRenderDashboard(user);

    const valueIds = ["currentBalanceAmount", "totalDebtAmount", "loanLimit", "availableCredit", "totalTakenLoans"];

    valueIds.forEach(id => {
        const element = document.getElementById(id);

        if (element) {
            element.classList.add("bank-money-value");
        }
    });
};

(function v19InstallDashboardClasses() {
    const summary = document.querySelector("#mainDashboard .summary-grid");

    if (summary) {
        summary.classList.add("bank-main-summary");
    }

    document.querySelectorAll("#mainDashboard .bank-main-summary .dash-card h2").forEach(element => {
        element.classList.add("bank-money-value");
    });
})();
