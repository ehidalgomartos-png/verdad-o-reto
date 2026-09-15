const express = require('express');
const http = http = require('http'); // Asegúrate de dejarlo como require('http') limpio
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8 
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

let jugadoresBuscando = [];

// Base de datos global ampliada en el servidor que acumulará las preguntas de los usuarios
const baseDeDatosServidor = {
  rompehielos: {
    verdades: [
      "¿Cuál es tu talento más inútil?",
      "¿Qué es lo más vergonzoso que has buscado en Google este mes?",
      "¿Alguna vez has fingido una llamada para escapar de una conversación aburrida?"
    ],
    retos: [
      "Ponte un calcetín en la oreja y hazte un selfie.",
      "Saca una foto imitando tu emoji favorito."
    ]
  },
  parejas: {
    verdades: [
      "¿Qué fue exactamente lo primero que pensaste la primera vez que me viste?",
      "¿Cuál ha sido nuestro mejor momento juntos hasta ahora?",
      "¿Qué manía mía te parece más tierna aunque no lo digas?"
    ],
    retos: [
      "Manda una foto soplando un beso de la manera más romántica posible.",
      "Hazte una foto haciendo forma de corazón con las manos."
    ]
  },
  seccionXX: {
    verdades: [
      "¿Cuál es tu fantasía sexual más oscura y prohibida que aún no has cumplido?",
      "¿En qué lugar más loco, inesperado o público has tenido relaciones?",
      "¿Cuál es tu zona del cuerpo más sensible al tacto?"
    ],
    retos: [
      "Sácate una foto mostrando tus labios mordidos de forma sugerente y cercana.",
      "Hazte una foto levantando ligeramente tu camiseta o marcando tu zona favorita."
    ]
  }
};

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  socket.on('entrar_lobby', (data) => {
    socket.nombre = data.nombre || 'Anónimo';
    socket.mazo = data.mazo || 'rompehielos';
    
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id);
    jugadoresBuscando.push({ id: socket.id, nombre: socket.nombre, mazo: socket.mazo });
    actualizarLobbyGlobal();
  });

  socket.on('retar_jugador', (data) => {
    const salaID = 'sala_' + Math.random().toString(36).substring(2, 9);
    const ofertadoID = data.oponenteID;
    const mazoElegido = data.mazo || 'rompehielos';
    
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id && j.id !== ofertadoID);
    actualizarLobbyGlobal();

    socket.join(salaID);
    socket.room = salaID;
    socket.mazoActual = mazoElegido;
    
    const oponenteSocket = io.sockets.sockets.get(ofertadoID);
    if (oponenteSocket) {
      oponenteSocket.join(salaID);
      oponenteSocket.room = salaID;
      oponenteSocket.mazoActual = mazoElegido;
      
      io.to(salaID).emit('partida_iniciada', { 
        salaID: salaID, 
        creadorID: socket.id, 
        mazo: mazoElegido 
      });
    }
  });

  // NUEVO: El usuario añade una pregunta al mazo global
  socket.on('crear_pregunta_usuario', (data) => {
    const { mazo, tipo, texto } = data;
    if (baseDeDatosServidor[mazo] && baseDeDatosServidor[mazo][tipo] && texto) {
      // Guardamos la pregunta para que alimente el juego permanentemente en esta sesión del servidor
      baseDeDatosServidor[mazo][tipo].push(texto);
      console.log(`Nueva pregunta añadida al mazo [${mazo}] (${tipo}): "${texto}"`);
    }
  });

  // NUEVO: Pedir una carta aleatoria al servidor que ya incluye las creadas por la comunidad
  socket.on('pedir_carta', (data) => {
    const { sala, tipo, mazo } = data;
    const lista = baseDeDatosServidor[mazo] ? baseDeDatosServidor[mazo][tipo] : baseDeDatosServidor.rompehielos[tipo];
    const cartaAleatoria = lista[Math.floor(Math.random() * lista.length)];
    
    // Enviamos la carta generada a todos los miembros de la sala
    io.to(sala).emit('servidor_envia_carta', { tipo, textoCarta: cartaAleatoria });
  });

  socket.on('unirse_sala', (salaID) => {
    socket.join(salaID);
    socket.room = salaID;
    socket.to(salaID).emit('oponente_unido');
  });

  socket.on('enviar_respuesta', (datos) => {
    socket.to(datos.sala).emit('recibir_respuesta', { respuesta: datos.respuesta, pregunta: datos.pregunta });
  });

  socket.on('enviar_foto', (datos) => {
    socket.to(datos.sala).emit('recibir_foto', datos.fotoBase64);
  });

  socket.on('abandonar_partida', (salaID) => {
    if (salaID) {
      socket.to(salaID).emit('oponente_abandono');
    }
  });

  socket.on('disconnect', () => {
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id);
    actualizarLobbyGlobal();
    if (socket.room) {
      socket.to(socket.room).emit('oponente_abandono');
    }
  });
});

function actualizarLobbyGlobal() {
  io.sockets.sockets.forEach((s) => {
    const enEspera = jugadoresBuscando.filter(j => j.id !== s.id && j.mazo === s.mazo);
    s.emit('actualizar_lista_espera', enEspera);
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT);