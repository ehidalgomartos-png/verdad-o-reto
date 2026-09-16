const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 2e6,
  cors: { origin: true, credentials: true }
});

app.disable('x-powered-by');
app.use(express.static(__dirname, { extensions: ['html'] }));

const PORT = process.env.PORT || 3000;
const VALID_MAZOS = new Set(['rompehielos', 'parejas', 'seccionXX']);
const waitingPlayers = new Map(); // socket.id -> { id, nombre, mazo }
const rooms = new Map(); // roomId -> { players:Set, creatorId, mazo }

function cleanName(value) {
  return String(value ?? 'Anónimo').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 24) || 'Anónimo';
}

function validDeck(mazo) {
  return VALID_MAZOS.has(mazo) ? mazo : 'rompehielos';
}

function safeRoomId() {
  return `sala_${crypto.randomBytes(6).toString('hex')}`;
}

function removeFromLobby(socketId) {
  waitingPlayers.delete(socketId);
  broadcastLobby();
}

function broadcastLobby() {
  for (const s of io.sockets.sockets.values()) {
    const me = s.id;
    const deck = s.mazo || 'rompehielos';
    const list = [...waitingPlayers.values()].filter(p => p.id !== me && p.mazo === deck);
    s.emit('actualizar_lista_espera', list);
  }
}

function leaveRoom(socket, notifyOpponent = false) {
  const roomId = socket.room;
  if (!roomId) return;
  const room = rooms.get(roomId);
  socket.leave(roomId);
  socket.room = null;
  if (!room) return;
  room.players.delete(socket.id);
  if (notifyOpponent) socket.to(roomId).emit('oponente_abandono');
  if (room.players.size === 0) rooms.delete(roomId);
  else if (room.creatorId === socket.id) room.creatorId = [...room.players][0];
}

io.on('connection', socket => {
  console.log('Usuario conectado:', socket.id);

  socket.on('entrar_lobby', (data = {}) => {
    leaveRoom(socket);
    socket.nombre = cleanName(data.nombre);
    socket.mazo = validDeck(data.mazo);
    waitingPlayers.set(socket.id, { id: socket.id, nombre: socket.nombre, mazo: socket.mazo });
    broadcastLobby();
  });

  socket.on('salir_lobby', () => removeFromLobby(socket.id));

  socket.on('retar_jugador', (data = {}, ack) => {
    const done = typeof ack === 'function' ? ack : () => {};
    const opponentId = String(data.oponenteID || '');
    const mazo = validDeck(data.mazo);
    const opponent = io.sockets.sockets.get(opponentId);
    const waitingOpponent = waitingPlayers.get(opponentId);

    if (!opponent || !waitingOpponent) return done({ ok: false, error: 'Ese jugador ya no está disponible.' });
    if (opponentId === socket.id) return done({ ok: false, error: 'No puedes retarte a ti mismo.' });
    if (waitingOpponent.mazo !== mazo) return done({ ok: false, error: 'El mazo ya no coincide.' });

    const salaID = safeRoomId();
    removeFromLobby(socket.id);
    removeFromLobby(opponentId);
    socket.join(salaID);
    opponent.join(salaID);
    socket.room = salaID;
    opponent.room = salaID;
    socket.mazo = opponent.mazo = mazo;

    rooms.set(salaID, { players: new Set([socket.id, opponent.id]), creatorId: socket.id, mazo });
    done({ ok: true, salaID });
    io.to(salaID).emit('partida_iniciada', {
      salaID,
      creadorID: socket.id,
      mazo,
      oponenteNombre: opponent.nombre || 'Tu oponente'
    });
  });

  socket.on('unirse_sala', (salaID, ack) => {
    const done = typeof ack === 'function' ? ack : () => {};
    const roomId = String(salaID || '').slice(0, 64);
    if (!roomId) return done({ ok: false, error: 'Sala no válida.' });

    removeFromLobby(socket.id);
    const room = rooms.get(roomId);
    if (room && room.players.size >= 2 && !room.players.has(socket.id)) {
      return done({ ok: false, error: 'La sala ya está completa.' });
    }

    socket.join(roomId);
    socket.room = roomId;
    if (room) {
      room.players.add(socket.id);
      socket.mazo = room.mazo;
      done({ ok: true, roomId, full: true });
      const opponent = [...room.players].filter(id => id !== socket.id).map(id => io.sockets.sockets.get(id)).find(Boolean);
      if (opponent) {
        socket.emit('oponente_unido', { nombre: opponent.nombre || 'Tu amigo' });
        opponent.emit('oponente_unido', { nombre: socket.nombre || 'Tu amigo' });
      }
    } else {
      rooms.set(roomId, { players: new Set([socket.id]), creatorId: socket.id, mazo: socket.mazo || 'rompehielos' });
      done({ ok: true, roomId, full: false });
    }
  });

  socket.on('accion_juego', (datos = {}) => {
    if (!socket.room || socket.room !== datos.sala) return;
    if (!VALID_MAZOS.has(socket.mazo || 'rompehielos')) return;
    const payload = {
      tipo: datos.tipo === 'reto' ? 'reto' : 'verdad',
      textoCarta: String(datos.textoCarta || '').slice(0, 1000),
      sala: socket.room
    };
    socket.to(socket.room).emit('actualizar_mesa', payload);
  });

  socket.on('enviar_respuesta', (datos = {}) => {
    if (!socket.room || socket.room !== datos.sala) return;
    socket.to(socket.room).emit('recibir_respuesta', {
      respuesta: String(datos.respuesta || '').slice(0, 500),
      pregunta: String(datos.pregunta || '').slice(0, 1000)
    });
  });

  socket.on('enviar_foto', (datos = {}) => {
    if (!socket.room || socket.room !== datos.sala) return;
    const foto = String(datos.fotoBase64 || '');
    if (!foto.startsWith('data:image/')) return;
    if (foto.length > 1.8e6) return;
    socket.to(socket.room).emit('recibir_foto', foto);
  });

  socket.on('escribiendo', sala => {
    if (socket.room && socket.room === sala) socket.to(sala).emit('mostrar_escribiendo');
  });

  socket.on('parar_escribir', sala => {
    if (socket.room && socket.room === sala) socket.to(sala).emit('ocultar_escribiendo');
  });

  socket.on('enviar_reaccion', (datos = {}) => {
    if (socket.room && socket.room === datos.sala) {
      const allowed = new Set(['🔥','😱','😂','❤️']);
      const emoji = allowed.has(datos.emoji) ? datos.emoji : '👍';
      socket.to(datos.sala).emit('recibir_reaccion', emoji);
    }
  });

  socket.on('tiempo_agotado', (datos = {}) => {
    if (socket.room && socket.room === datos.sala) socket.to(datos.sala).emit('tiempo_agotado_remoto');
  });

  socket.on('abandonar_partida', salaID => {
    if (socket.room && socket.room === salaID) leaveRoom(socket, true);
  });

  socket.on('disconnect', () => {
    removeFromLobby(socket.id);
    leaveRoom(socket, true);
    console.log('Usuario desconectado:', socket.id);
  });
});

server.listen(PORT, () => console.log(`V/R escuchando en http://localhost:${PORT}`));
