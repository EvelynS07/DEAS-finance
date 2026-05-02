// --- ESTRUTURA DE DADOS ---

// 1. TABELA HASH (Hash Table): Usamos um objeto JavaScript como um dicionário chave-valor (Onde a Chave = CPF)
const ClientRegistry = {
    storage: {}, // Armazena os dados através de hashing nativo do JS
    insert(cpf, data) { this.storage[cpf] = data; },
    get(cpf) { return this.storage[cpf]; }
};

let currentUserCpf = null;
// --- RECURSIVIDADE ---
function sumDebts(debts, index = 0) {
    if (index >= debts.length) return 0;
    return debts[index].valor + sumDebts(debts, index + 1);
}
// --- NAVEGAÇÃO AUTH & MODAL ---
function showLogin() {
    document.getElementById('registerBox').classList.add('hidden');
    document.getElementById('loginBox').classList.remove('hidden');
}

function showRegister() {
    document.getElementById('loginBox').classList.add('hidden');
    document.getElementById('registerBox').classList.remove('hidden');
}

function showLgpdModal() {
    document.getElementById('lgpdModal').classList.remove('hidden');
}

function closeLgpdModal() {
    document.getElementById('lgpdModal').classList.add('hidden');
}

function logout() { location.reload(); }
// --- CADASTRO ---
document.getElementById('registerForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const cpf = document.getElementById('regCpf').value;
    const password = document.getElementById('regPassword').value;

    // 2. STRUCT (Objeto/Registro): O objeto 'data' inserido abaixo age como um Struct, agregando tipos diferentes.
    ClientRegistry.insert(cpf, {
        nome: name,
        senha: password,
        scoreOriginal: Math.floor(Math.random() * 600) + 300,
        score: 0,
        dividas: [
            { empresa: "Energia S/A", vencimento: "2026-05-10", valor: 250.50 },
            { empresa: "Net Plus", vencimento: "2026-05-15", valor: 99.90 }
        ],
        limite: 1500.00
    });

    alert("Cadastro realizado! Use seu CPF para entrar.");
    showLogin();
});

// --- LOGIN ---
document.getElementById('loginForm').addEventListener('submit', function(e){
    e.preventDefault();
    const cpf = document.getElementById('loginCpf').value;
    const user = ClientRegistry.get(cpf); // Busca O(1) na Tabela Hash

    if (user) {
        if(user.senha === document.getElementById('loginPassword').value) {
            currentUserCpf = cpf;
            renderDashboard(user);
        } else {
            alert("Senha incorreta!");
        }
    } else {
        alert("Usuário não encontrado!");
    }
});

// --- ATUALIZAÇÃO DE INTERFACE ---
function renderDashboard(user) {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');

    document.getElementById('clientNameDisplay').innerText = user.nome;

    // Lógica de Score Dinâmico
    const penalidadePorDivida = 50;
    if(!user.scoreOriginal) user.scoreOriginal = user.score; 
    user.score = user.scoreOriginal - (user.dividas.length * penalidadePorDivida);
    if(user.score < 0) user.score = 0;

    // Elementos do Gráfico de Score
    const scoreCircle = document.getElementById('scoreCircle');
    const scoreNumber = document.getElementById('scoreNumber');
    const scoreFeedback = document.getElementById('scoreFeedback');

    const scorePct = (user.score / 1000) * 100;
    if(scoreCircle) scoreCircle.style.strokeDasharray = `${scorePct}, 100`;
    if(scoreNumber) scoreNumber.textContent = user.score;

    // Aplica as cores na borda (stroke) e texto, usando classes do CSS
    if (user.score < 400) {
        if(scoreCircle) scoreCircle.setAttribute('class', 'circle stroke-low');
        if(scoreNumber) scoreNumber.setAttribute('class', 'percentage text-low');
        if(scoreFeedback) scoreFeedback.innerText = "Atenção: Score Baixo";
    } else if (user.score < 700) {
        if(scoreCircle) scoreCircle.setAttribute('class', 'circle stroke-med');
        if(scoreNumber) scoreNumber.setAttribute('class', 'percentage text-med');
        if(scoreFeedback) scoreFeedback.innerText = "Seu score é Regular";
    } else {
        if(scoreCircle) scoreCircle.setAttribute('class', 'circle stroke-high');
        if(scoreNumber) scoreNumber.setAttribute('class', 'percentage text-high');
        if(scoreFeedback) scoreFeedback.innerText = "Excelente saúde financeira!";
    }

    renderDebtTable(user);
    updateInvestmentsUI();
}

function renderDebtTable(user) {
    const tbody = document.getElementById('debtTableBody');
    if(!tbody) return;

    tbody.innerHTML = user.dividas.map((d, index) => `
        <tr>
            <td><strong>${d.empresa}</strong></td>
            <td>${d.vencimento}</td>
            <td>R$ ${d.valor.toFixed(2)}</td>
            <td><span class="status-badge">Pendente</span></td>
            <td><button class="btn-action" onclick="payDebt(${index})">Pagar</button></td>
        </tr>
    `).join('');

    const total = sumDebts(user.dividas); // Uso da recursividade
    document.getElementById('totalDebtAmount').innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('debtCount').innerText = `${user.dividas.length} pendências ativas`;
    document.getElementById('loanLimit').innerText = `R$ ${user.limite.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

// --- FUNÇÕES DE AÇÃO ---
function payDebt(index) {
    const user = ClientRegistry.get(currentUserCpf);
    if (confirm("Pagar este débito?")) {
        user.dividas.splice(index, 1);
        renderDashboard(user); 
        alert("Pago com sucesso!");
    }
}

function requestLimitIncrease() {
    const user = ClientRegistry.get(currentUserCpf);
    if (user.dividas.length > 0) {
        alert("Negado: Pague suas dívidas primeiro.");
        return;
    }
    if (user.score > 600) {
        user.limite += 500;
        renderDashboard(user);
        alert("Aumento aprovado!");
    } else {
        alert("Score baixo para aumento.");
    }
}

function switchTab(tabName) {
    const dash = document.getElementById('mainDashboard');
    const inv = document.getElementById('investmentsSection');
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => item.classList.remove('active'));

    if (tabName === 'dashboard') {
        dash.classList.remove('hidden');
        inv.classList.add('hidden');
        navItems[0].classList.add('active');
    } else {
        dash.classList.add('hidden');
        inv.classList.remove('hidden');
        navItems[1].classList.add('active');
        updateInvestmentsUI();
    }
}

function takeLoan() {
    const user = ClientRegistry.get(currentUserCpf);
    const LIMITE_MAXIMO = 5000.00;
    
    const totalContratado = user.dividas
        .filter(d => d.empresa === "DEASBank")
        .reduce((a, b) => a + b.valor, 0);

    if (totalContratado + 1000 <= LIMITE_MAXIMO) {
        const hoje = new Date();
        const dataVencimento = new Date();
        dataVencimento.setDate(hoje.getDate() + 30);
        const vencimentoFormatado = dataVencimento.toISOString().split('T')[0];

        user.dividas.push({ 
            empresa: "DEASBank", 
            vencimento: vencimentoFormatado, 
            valor: 1000.00 
        });
        
        renderDashboard(user);
        alert(`Empréstimo concedido! Vencimento em: ${vencimentoFormatado}`);
    } else {
        alert("Limite de empréstimo excedido.");
    }
}

function updateInvestmentsUI() {
    const user = ClientRegistry.get(currentUserCpf);
    const totalContratado = user.dividas.filter(d => d.empresa === "DEASBank").reduce((a, b) => a + b.valor, 0);
    document.getElementById('totalTakenLoans').innerText = `R$ ${totalContratado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('availableCredit').innerText = `R$ ${(5000 - totalContratado).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}