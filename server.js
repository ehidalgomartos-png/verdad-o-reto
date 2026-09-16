const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 12e6,
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

const AVATAR_EMOJIS = new Set(['😎','😈','🤠','🥷','👽','🐯']);

function cleanAvatar(value) {
  const avatar = String(value || '');
  if (AVATAR_EMOJIS.has(avatar)) return avatar;
  if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(avatar) && avatar.length <= 350000) return avatar;
  return '';
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
    socket.avatar = cleanAvatar(data.avatar);
    waitingPlayers.set(socket.id, { id: socket.id, nombre: socket.nombre, mazo: socket.mazo, avatar: socket.avatar });
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
    socket.emit('partida_iniciada', {
      salaID,
      creadorID: socket.id,
      mazo,
      oponenteNombre: opponent.nombre || 'Tu oponente',
      oponenteAvatar: opponent.avatar || ''
    });
    opponent.emit('partida_iniciada', {
      salaID,
      creadorID: socket.id,
      mazo,
      oponenteNombre: socket.nombre || 'Tu oponente',
      oponenteAvatar: socket.avatar || ''
    });
  });

  socket.on('unirse_sala', (payload, ack) => {
    const done = typeof ack === 'function' ? ack : () => {};
    const data = (payload && typeof payload === 'object') ? payload : { salaID: payload };
    const roomId = String(data.salaID || '').slice(0, 64);
    if (!roomId) return done({ ok: false, error: 'Sala no válida.' });

    // En salas privadas necesitamos conocer el nombre del jugador desde el
    // mismo momento en que entra para poder mostrárselo a su rival.
    if (data.nombre) socket.nombre = cleanName(data.nombre);
    if (data.mazo) socket.mazo = validDeck(data.mazo);
    if (Object.prototype.hasOwnProperty.call(data, 'avatar')) socket.avatar = cleanAvatar(data.avatar);

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
        // El creador de la sala es quien inicia la partida.
        socket.emit('oponente_unido', {
          nombre: opponent.nombre || 'Tu amigo',
          avatar: opponent.avatar || '',
          tuTurno: false
        });
        opponent.emit('oponente_unido', {
          nombre: socket.nombre || 'Tu amigo',
          avatar: socket.avatar || '',
          tuTurno: true
        });
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

  socket.on('enviar_media', (datos = {}, ack) => {
    const done = typeof ack === 'function' ? ack : () => {};
    if (!socket.room || socket.room !== datos.sala) {
      return done({ ok: false, error: 'La sala ya no está activa.' });
    }

    const tipo = datos.tipo === 'video' ? 'video' : 'imagen';
    const dataUrl = String(datos.dataUrl || '');
    const mime = String(datos.mime || '').slice(0, 80);

    // FileReader puede generar, por ejemplo:
    // data:video/webm;codecs=vp8,opus;base64,...
    // La validación anterior solo aceptaba data:video/webm;base64,... y
    // descartaba el vídeo silenciosamente antes de enviarlo al rival.
    const esImagenValida = tipo === 'imagen' && /^data:image\/(?:jpeg|png|webp)(?:;[^;]+)*;base64,/i.test(dataUrl);
    const esVideoValido = tipo === 'video' && /^data:video\/(?:webm|mp4)(?:;[^;]+)*;base64,/i.test(dataUrl);

    if (!esImagenValida && !esVideoValido) {
      return done({ ok: false, error: 'El formato de la prueba no es válido.' });
    }
    if (dataUrl.length > 9e6) {
      return done({ ok: false, error: 'El vídeo pesa demasiado. Grábalo un poco más corto.' });
    }

    socket.to(socket.room).emit('recibir_media', { tipo, dataUrl, mime });
    done({ ok: true });
  });

  // Compatibilidad con clientes antiguos que todavía envíen solo fotos.
  socket.on('enviar_foto', (datos = {}) => {
    if (!socket.room || socket.room !== datos.sala) return;
    const foto = String(datos.fotoBase64 || '');
    if (!foto.startsWith('data:image/') || foto.length > 1.8e6) return;
    socket.to(socket.room).emit('recibir_media', { tipo: 'imagen', dataUrl: foto, mime: 'image/jpeg' });
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
