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

function updateMutualDataVisibility(connectionStatus) {
    const card = document.getElementById("requestDeasFinanceDataCard");
    if (!card) return;
    const canAsk = ["connection_approved", "data_approved", "data_denied"].includes(String(connectionStatus || ""));
    card.classList.toggle("hidden", !canAsk);
}

function openFinanceStatusLabel(status) {
    if (status === "connection_approved") return "Conexão aceita";
    if (status === "connection_denied") return "Conexão recusada";
    if (status === "data_pending") return "Aguardando dados";
    if (status === "data_approved") return "Dados aceitos";
    if (status === "data_denied") return "Dados recusados";
    if (status === "approved") return "Aceito";
    if (status === "denied") return "Recusado";

    return "Aguardando aceite";
}

function openFinanceStatusClass(status) {
    if (status === "connection_approved" || status === "data_approved" || status === "approved") return "approved";
    if (status === "connection_denied" || status === "data_denied" || status === "denied") return "denied";

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

        if (deasFinanceDb && currentUserId) {
            const localConnSnap = await deasBankDb.collection("users").doc(currentUserId).collection("openFinanceConnections").doc("deasfinance").get();
            const localConn = localConnSnap.exists ? localConnSnap.data() : null;
            updateMutualDataVisibility(localConn?.connectionStatus);
            const ids = [localConn?.partnerRequestId, localConn?.dataRequestId].filter(Boolean);
            for (const id of ids) {
                const partnerSnap = await deasFinanceDb.collection("openFinanceRequests").doc(id).get();
                if (partnerSnap.exists) {
                    requests.push({ id: partnerSnap.id, partnerProject: "deasfinance", direction: "enviado", ...partnerSnap.data() });
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
                const available = Number(user.saldo ?? user.limite ?? 0);
                if (available < amount) {
                    alert(`Saldo insuficiente no DeasBank para transferir ${formatOpenFinanceMoney(amount)}. Disponível: ${formatOpenFinanceMoney(available)}.`);
                    return;
                }
                user.saldo = available - amount;
                updatePayload.importedSalary = amount;
                updatePayload.transferAmount = amount;
                updatePayload.moneyMoved = true;
                updatePayload.externalBalance = Number(user.saldo || 0);
                updatePayload.externalDebt = sumDebts(user.dividas || []);
                updatePayload.externalLimit = Number(user.limite || 0);
                updatePayload.creditScore = Number(user.scoreOriginal || user.score || 500);
                updatePayload.requestedData = { importedSalary: amount, externalBalance: updatePayload.externalBalance, externalDebt: updatePayload.externalDebt, externalLimit: updatePayload.externalLimit };
                await persistCurrentUser();
                renderDashboard(user);
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

        updateMutualDataVisibility("connection_pending");
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

        if (!local || !["connection_approved", "data_approved", "data_denied"].includes(local.connectionStatus)) {
            alert("Primeiro solicite a conexão e aguarde o Deas Finance aceitar.");
            return;
        }

        const requestedSalary = Number(prompt("Quanto de salário deseja trazer do Deas Finance?", "3200") || 0);
        if (requestedSalary <= 0) return alert("Informe um valor válido para trazer salário.");

        const payload = {
            consentId: `deasbank_data_${currentUserId}_${Date.now()}`,
            sourceBank: "DeasBank",
            partnerBank: "Deas Finance",
            userId: currentUserId,
            userName: user.nome || "Cliente DeasBank",
            emailMasked: maskEmailForOpenFinance(user.email),
            purpose: "solicitacao_transferencia_dados_open_finance",
            requestType: "data_transfer_request",
            sameOwner: true,
            permissions: { income: true, balance: true, debts: true, creditLimit: true, loans: true },
            requestedData: { importedSalary: requestedSalary, requestedSalaryAmount: requestedSalary },
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
            sharedPayload: { ...payload, partnerRequestId: ref.id },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        alert("Pedido de salário, saldo, dívidas, limite e empréstimos enviado ao Deas Finance.");
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
            sharedPayload: { ...(local.sharedPayload || {}), ...partner, partnerRequestId: requestId },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (status === "data_approved") {
            update.importedSalary = Number(partner.importedSalary || partner.requestedData?.importedSalary || 0);
            update.externalBalance = Number(partner.externalBalance || partner.requestedData?.externalBalance || 0);
            update.externalDebt = Number(partner.externalDebt || partner.requestedData?.externalDebt || 0);
            update.externalLimit = Number(partner.externalLimit || partner.requestedData?.externalLimit || 0);

            const user = ClientRegistry.get(currentUserId);
            if (user) {
                user.scoreOriginal = Math.min(950, Number(user.scoreOriginal || 500) + (update.importedSalary >= 3000 ? 30 : 10));
                user.limite = Math.max(Number(user.limite || 0), update.externalLimit || 0);
                if (partner.moneyMoved && !local.moneyMovedApplied && update.importedSalary > 0) {
                    user.saldo = Number(user.saldo || 0) + update.importedSalary;
                    update.moneyMovedApplied = true;
                    alert(`Salário transferido: ${formatOpenFinanceMoney(update.importedSalary)} entrou no DeasBank.`);
                }
                await persistCurrentUser();
                renderDashboard(user);
            }
        }

        updateMutualDataVisibility(status);
        await localRef.set(update, { merge: true });
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
