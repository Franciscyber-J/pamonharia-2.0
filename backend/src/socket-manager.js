// ARQUITETO: Novo ficheiro para centralizar e garantir o acesso global à instância do Socket.IO.
// Isso resolve a falha crítica de comunicação em tempo real de forma robusta e escalável.

/**
 * @type {import('socket.io').Server | null}
 */
let ioInstance = null;

module.exports = {
  /**
   * Inicializa o gerenciador com a instância do Socket.IO criada no index.js.
   * Deve ser chamado apenas uma vez, no arranque do servidor.
   * @param {import('socket.io').Server} io A instância do servidor Socket.IO.
   */
  init: (io) => {
    if (!ioInstance) {
      ioInstance = io;
      console.log('[SocketManager] ✅ Instância do Socket.IO registrada com sucesso.');
    }
  },

  /**
   * Retorna a instância global e única do Socket.IO.
   * Lança um erro se o Socket.IO não tiver sido inicializado, prevenindo falhas silenciosas.
   * @returns {import('socket.io').Server}
   */
  getIO: () => {
    if (!ioInstance) {
      throw new Error("Socket.IO não foi inicializado. Chame socketManager.init(io) primeiro.");
    }
    return ioInstance;
  }
};