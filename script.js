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

try {
    firebase.initializeApp(firebaseConfig);
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

// --- RECURSIVIDADE ---
function sumDebts(debts, index = 0) {
    if (index >= debts.length) return 0;
    return debts[index].valor + sumDebts(debts, index + 1);
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
function logout() { location.reload(); }

// --- CADASTRO ---
document.getElementById('registerForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const cpf = document.getElementById('regCpf').value;
    const password = document.getElementById('regPassword').value;

    ClientRegistry.insert(cpf, {
        nome: name,
        senha: password,
        scoreOriginal: Math.floor(Math.random() * 400) + 500, // Começa entre 500 e 900
        score: 0,
        dividas: [
            { empresa: "Energia S/A", vencimento: "2026-05-10", valor: 150.00, peso: 1.2 },
            { empresa: "Net Plus", vencimento: "2026-05-15", valor: 100.00, peso: 1.0 }
        ],
        limite: 1500.00
    });

    alert("Cadastro realizado!");
    showLogin();
});

// --- LOGIN ---
document.getElementById('loginForm').addEventListener('submit', function(e){
    e.preventDefault();
    const cpf = document.getElementById('loginCpf').value;
    const user = ClientRegistry.get(cpf);

    if (user && user.senha === document.getElementById('loginPassword').value) {
        currentUserCpf = cpf;
        renderDashboard(user);
    } else {
        alert("Credenciais inválidas!");
    }
});

// --- LÓGICA DE PESOS E REGRAS (O coração do ajuste) ---
function calculateWeightedScore(user) {
    // PESOS DEFINIDOS:
    const PESO_POR_PENDENCIA = 30;    // Cada dívida tira 30 pontos fixos
    const PESO_VALOR_DIVIDA = 0.05;   // Cada R$ 1,00 de dívida tira 0.05 pontos
    const PENALIDADE_INTERNA = 1.5;   // Dívidas com o "DEASBank" pesam 50% a mais

    let deducaoTotal = 0;

    user.dividas.forEach(divida => {
        let multiplicador = divida.empresa === "DEASBank" ? PENALIDADE_INTERNA : 1.0;
        
        // Regra: (Fixo + (Valor * Proporção)) * Peso da Origem
        deducaoTotal += (PESO_POR_PENDENCIA + (divida.valor * PESO_VALOR_DIVIDA)) * multiplicador;
    });

    const novoScore = user.scoreOriginal - deducaoTotal;
    return Math.max(0, Math.floor(novoScore));
}

// --- ATUALIZAÇÃO DE INTERFACE ---
function renderDashboard(user) {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('clientNameDisplay').innerText = user.nome;

    // Aplica a nova lógica de pesos
    user.score = calculateWeightedScore(user);

    const scoreCircle = document.getElementById('scoreCircle');
    const scoreNumber = document.getElementById('scoreNumber');
    const scoreFeedback = document.getElementById('scoreFeedback');
    const scorePct = (user.score / 1000) * 100;

    scoreCircle.style.strokeDasharray = `${scorePct}, 100`;
    scoreNumber.textContent = user.score;

    // Cores nas bordas (Interface original mantida)
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
}

function renderDebtTable(user) {
    const tbody = document.getElementById('debtTableBody');
    tbody.innerHTML = user.dividas.map((d, index) => `
        <tr>
            <td><strong>${d.empresa}</strong></td>
            <td>${d.vencimento}</td>
            <td>R$ ${d.valor.toFixed(2)}</td>
            <td><span class="status-badge">Pendente</span></td>
            <td><button class="btn-action" onclick="payDebt(${index})">Pagar</button></td>
        </tr>
    `).join('');

    const total = sumDebts(user.dividas);
    document.getElementById('totalDebtAmount').innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('debtCount').innerText = `${user.dividas.length} pendências ativas`;
    document.getElementById('loanLimit').innerText = `R$ ${user.limite.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

// --- REGRAS DE CONCESSÃO ---
function requestLimitIncrease() {
    const user = ClientRegistry.get(currentUserCpf);
    const totalDividas = sumDebts(user.dividas);
    
    // Regra de Concessão 1: Peso do comprometimento de renda
    // Se a dívida total for maior que 20% do limite atual, nega.
    if (totalDividas > (user.limite * 0.2)) {
        alert("Aumento Negado: Comprometimento financeiro muito alto.");
        return;
    }

    // Regra de Concessão 2: Peso do Score
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
    const totalContratado = user.dividas.filter(d => d.empresa === "DEASBank").reduce((a, b) => a + b.valor, 0);

    // Regra de Concessão 3: Avaliação de Risco
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

// --- FUNÇÃO DE PAGAMENTO ATUALIZADA ---
function payDebt(index) {
    const user = ClientRegistry.get(currentUserCpf);
    const divida = user.dividas[index];

    // Validação: Verifica se o limite disponível cobre o valor da dívida
    if (user.limite < divida.valor) {
        alert("Saldo insuficiente no Limite Disponível para quitar esta dívida.");
        return;
    }

    if (confirm(`Confirmar pagamento de R$ ${divida.valor.toFixed(2)} utilizando seu limite?`)) {
        // 1. Retira o saldo do limite disponível
        user.limite -= divida.valor;

        // 2. Remove a dívida da lista (baixa no sistema)
        user.dividas.splice(index, 1);

        // 3. Atualiza toda a interface (Score, Tabelas, Cards)
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

    // Mantém compatibilidade com o botão existente: switchTab('open finance')
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
        .reduce((a, b) => a + b.valor, 0);

    // O código só tenta atualizar se os IDs existirem no HTML
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
    if (status === 'approved') return 'Aprovado';
    if (status === 'denied') return 'Negado';
    return 'Pendente';
}

async function loadOpenFinanceRequests() {
    const tbody = document.getElementById('openFinanceTableBody');
    if (!tbody) return;

    if (!deasBankDb) {
        tbody.innerHTML = '<tr><td colspan="7">Firebase do DeasBank não iniciou. Confira a configuração.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7">Carregando solicitações...</td></tr>';

    try {
        const snapshot = await deasBankDb.collection('openFinanceRequests').get();
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        requests.sort((a, b) => String(b.createdAtText || '').localeCompare(String(a.createdAtText || '')));

        if (!requests.length) {
            tbody.innerHTML = '<tr><td colspan="7">Nenhuma solicitação Open Finance recebida ainda.</td></tr>';
            return;
        }

        tbody.innerHTML = requests.map(request => {
            const status = request.status || 'pending';
            const canAnalyze = status !== 'approved' && status !== 'denied';

            return `
                <tr>
                    <td>
                        <strong>${escapeOpenFinanceText(request.userName || 'Cliente')}</strong><br>
                        <small>${escapeOpenFinanceText(request.emailMasked || 'e-mail protegido')}</small>
                    </td>
                    <td>${escapeOpenFinanceText(request.creditScore || 0)}</td>
                    <td>${escapeOpenFinanceText(request.balanceRange || 'Não informado')}</td>
                    <td>${escapeOpenFinanceText(request.debtRange || 'Não informado')}</td>
                    <td>${formatOpenFinanceMoney(request.availableLimit)}</td>
                    <td><span class="status-badge">${openFinanceStatusLabel(status)}</span></td>
                    <td>
                        ${canAnalyze ? `
                            <button class="btn-action" onclick="approveOpenFinanceRequest('${request.id}', ${Number(request.availableLimit || 0)}, ${Number(request.creditScore || 0)})">Aprovar</button>
                            <button class="btn-action" style="margin-left:6px; background:#ffe1e1; color:#b00020;" onclick="denyOpenFinanceRequest('${request.id}')">Negar</button>
                        ` : `<small>${escapeOpenFinanceText(request.analysisMessage || 'Analisado')}</small>`}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="7">Erro ao carregar solicitações: ${escapeOpenFinanceText(error.message)}</td></tr>`;
    }
}

async function approveOpenFinanceRequest(requestId, availableLimit, creditScore) {
    if (!deasBankDb) return alert('Firebase não iniciou.');

    let approvedAmount = 0;

    if (creditScore >= 700) {
        approvedAmount = Math.min(availableLimit * 0.60, 5000);
    } else if (creditScore >= 600) {
        approvedAmount = Math.min(availableLimit * 0.35, 2500);
    } else {
        approvedAmount = Math.min(availableLimit * 0.15, 1000);
    }

    await deasBankDb.collection('openFinanceRequests').doc(requestId).update({
        status: 'approved',
        approvedAmount,
        analysisMessage: 'Crédito aprovado pelo DEASBank.',
        analyzedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert(`Crédito aprovado: ${formatOpenFinanceMoney(approvedAmount)}`);
    loadOpenFinanceRequests();
}

async function denyOpenFinanceRequest(requestId) {
    if (!deasBankDb) return alert('Firebase não iniciou.');

    await deasBankDb.collection('openFinanceRequests').doc(requestId).update({
        status: 'denied',
        approvedAmount: 0,
        analysisMessage: 'Crédito negado pelo DEASBank.',
        analyzedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert('Crédito negado pelo DEASBank.');
    loadOpenFinanceRequests();
}
