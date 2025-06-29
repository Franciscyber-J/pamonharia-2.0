// Importa o framework Express, que nos ajuda a construir o servidor e as rotas.
const express = require('express');

// Importa as nossas rotas definidas no ficheiro routes.js
const routes = require('./routes');

// Cria a instância principal da nossa aplicação. A variável 'app' é o nosso servidor.
const app = express();

/**
 * Middlewares Essenciais
 */

// Este middleware diz ao Express para "aprender" a ler corpos de requisição em formato JSON.
// Sem ele, o 'request.body' chegaria como indefinido (undefined).
app.use(express.json()); 

// Este middleware diz ao nosso app para usar todas as rotas que definimos no ficheiro importado.
app.use(routes);


/**
 * Inicialização do Servidor
 */

// Define a porta em que nosso servidor irá "ouvir" por requisições.
const PORT = 10000;

// O comando que efetivamente inicia o servidor e o faz esperar por requisições na porta definida.
// A função de callback '() => { ... }' é executada assim que o servidor está pronto.
app.listen(PORT, () => {
  console.log('----------------------------------------------------');
  console.log('✅ Servidor Backend da Pamonharia 2.0 INICIADO');
  console.log(`🚀 API rodando em: http://localhost:${PORT}`);
  console.log('----------------------------------------------------');
  console.log('       -- ACESSO ÀS PÁGINAS (FRONTEND) --');
  console.log('');
  console.log('🔑 Dashboard Login:');
  console.log(`   http://localhost:${PORT}/`); // MUDANÇA AQUI
  console.log('');
  console.log('🍽️ Cardápio Público:');
  console.log(`   http://localhost:${PORT}/cardapio`); // MUDANÇA AQUI
  console.log('----------------------------------------------------');
  console.log('Aguardando requisições...');

  // Dica: Para abrir os ficheiros acima com auto-reload,
  // use a extensão "Live Server" no VS Code (clique com o botão direito no ficheiro > Open with Live Server).
});