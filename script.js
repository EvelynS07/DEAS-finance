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

f// --- FUNÇÃO DE PAGAMENTO ATUALIZADA ---
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
    const navItems = document.querySelectorAll('.nav-item');
    
    // Remove a classe active de todos os botões da barra lateral
    navItems.forEach(item => item.classList.remove('active'));

    if (tabName === 'dashboard') {
        if(dash) dash.classList.remove('hidden');
        if(inv) inv.classList.add('hidden');
        if(navItems[0]) navItems[0].classList.add('active');
    } else {
        if(dash) dash.classList.add('hidden');
        if(inv) inv.classList.remove('hidden');
        if(navItems[1]) navItems[1].classList.add('active');
        updateInvestmentsUI();
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