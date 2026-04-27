// Base de dados simulada
const baseDeClientes = {};
let clienteLogado = null;

// Referências de UI
const authScreen = document.getElementById('auth-screen');
const dashScreen = document.getElementById('dashboard-screen');

function feedback(elementoId, texto, tipo = 'sucesso') {
    const el = document.getElementById(elementoId);
    el.textContent = texto;
    el.className = tipo;
    setTimeout(() => el.textContent = '', 4000);
}

function cadastrar() {
    const cpf = document.getElementById('cpf').value;
    const senha = document.getElementById('senha').value;
    const termos = document.getElementById('termos').checked;

    if (!cpf || !senha) return feedback('auth-mensagem', 'Preencha todos os campos.', 'erro');
    if (!termos) return feedback('auth-mensagem', 'Aceite os termos de uso para continuar.', 'erro');
    if (baseDeClientes[cpf]) return feedback('auth-mensagem', 'Este CPF já possui conta.', 'erro');

    baseDeClientes[cpf] = {
        senha: senha,
        scoreInterno: 500,
        dadosOpenFinance: null
    };

    feedback('auth-mensagem', 'Conta criada! Pode entrar.');
}

function fazerLogin() {
    const cpf = document.getElementById('cpf').value;
    const senha = document.getElementById('senha').value;
    const cliente = baseDeClientes[cpf];

    if (cliente && cliente.senha === senha) {
        clienteLogado = { cpf, ...cliente };
        entrarNoDashboard();
    } else {
        feedback('auth-mensagem', 'Dados de acesso incorretos.', 'erro');
    }
}

function entrarNoDashboard() {
    authScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
    document.getElementById('user-cpf').textContent = clienteLogado.cpf;
    atualizarStatusOpenFinance();
}

function conectarOpenFinance() {
    feedback('dash-mensagem', 'Acedendo a dados bancários externos...');
    
    setTimeout(() => {
        clienteLogado.dadosOpenFinance = { pontualidade: 880 };
        atualizarStatusOpenFinance();
        feedback('dash-mensagem', 'Open Finance sincronizado!');
    }, 1500);
}

function atualizarStatusOpenFinance() {
    const badge = document.getElementById('open-finance-status');
    const conectado = !!clienteLogado.dadosOpenFinance;
    
    badge.textContent = conectado ? 'Open Finance: Ativo' : 'Open Finance: Pendente';
    badge.style.background = conectado ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)';
    badge.style.color = conectado ? '#34d399' : '#f87171';
}

function solicitarCredito() {
    const valor = parseFloat(document.getElementById('valor-credito').value);
    if (!valor) return feedback('dash-mensagem', 'Insira um valor válido.', 'erro');

    // Regras e Pesos
    const pesoInterno = 0.6;
    const pesoExterno = 0.4;
    const scoreExterno = clienteLogado.dadosOpenFinance ? clienteLogado.dadosOpenFinance.pontualidade : 0;
    
    const scoreFinal = (clienteLogado.scoreInterno * pesoInterno) + (scoreExterno * pesoExterno);

    if (scoreFinal > 450 && valor <= (scoreFinal * 12)) {
        feedback('dash-mensagem', `Crédito Aprovado! Score: ${scoreFinal.toFixed(0)}`);
    } else {
        feedback('dash-mensagem', 'Análise negada pela política de risco.', 'erro');
    }
}

function sair() {
    clienteLogado = null;
    dashScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
}