const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8 
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Lista de jugadores esperando en el Lobby público
let jugadoresBuscando = [];

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // 1. Unirse al Lobby público para buscar partida
  socket.on('entrar_lobby', (nombre) => {
    socket.nombre = nombre || 'Anónimo';
    // Evitamos duplicados
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id);
    jugadoresBuscando.push({ id: socket.id, nombre: socket.nombre });
    
    // Avisar a todos los del lobby la lista actualizada
    io.emit('actualizar_lista_espera', jugadoresBuscando);
  });

  // 2. Retar a un jugador específico de la lista
  socket.on('retar_jugador', (ofertadoID) => {
    const salaID = 'sala_' + Math.random().toString(36).substring(2, 9);
    
    // Sacar a ambos de la lista de espera
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id && j.id !== ofertadoID);
    io.emit('actualizar_lista_espera', jugadoresBuscando);

    // Unir al retador y al retado a la misma sala de Socket.io
    socket.join(salaID);
    
    // Buscar al socket del oponente y meterlo en la sala
    const oponenteSocket = io.sockets.sockets.get(ofertadoID);
    if (oponenteSocket) {
      oponenteSocket.join(salaID);
      // Notificar a ambos que la partida comienza
      io.to(salaID).emit('partida_iniciada', { salaID: salaID, creadorID: socket.id });
    }
  });

  // 3. Salas privadas por enlace de WhatsApp (como ya tenías)
  socket.on('unirse_sala', (salaID) => {
    socket.join(salaID);
    socket.to(salaID).emit('oponente_unido');
  });

  // 4. Lógica de juego y fotos
  socket.on('accion_juego', (datos) => {
    socket.to(datos.sala).emit('actualizar_mesa', datos);
  });

  socket.on('enviar_respuesta', (datos) => {
    socket.to(datos.sala).emit('recibir_respuesta', datos.respuesta);
  });

  socket.on('enviar_foto', (datos) => {
    socket.to(datos.sala).emit('recibir_foto', datos.fotoBase64);
  });

  // 5. Desconexión
  socket.on('disconnect', () => {
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id);
    io.emit('actualizar_lista_espera', jugadoresBuscando);
    console.log('Usuario desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);