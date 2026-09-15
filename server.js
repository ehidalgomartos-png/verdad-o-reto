const express = require('express');
const http = http = require('http'); // o simplemente require('http');
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

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  socket.on('entrar_lobby', (nombre) => {
    socket.nombre = nombre || 'Anónimo';
    jugadoresBuscando = jugadorasBuscandoFiltro(jugadoresBuscando, socket.id); // o la línea limpia de abajo
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id);
    jugadoresBuscando.push({ id: socket.id, nombre: socket.nombre });
    io.emit('actualizar_lista_espera', jugadoresBuscando);
  });

  socket.on('retar_jugador', (data) => {
    const salaID = 'sala_' + Math.random().toString(36).substring(2, 9);
    const ofertadoID = data.oponenteID;
    const mazoElegido = data.mazo || 'rompehielos';
    
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id && j.id !== ofertadoID);
    io.emit('actualizar_lista_espera', jugadoresBuscando);

    socket.join(salaID);
    socket.room = salaID; // Guardamos la sala actual en el socket
    
    const oponenteSocket = io.sockets.sockets.get(ofertadoID);
    if (oponenteSocket) {
      oponenteSocket.join(salaID);
      oponenteSocket.room = salaID;
      io.to(salaID).emit('partida_iniciada', { 
        salaID: salaID, 
        creadorID: socket.id, 
        mazo: mazoElegido 
      });
    }
  });

  socket.on('unirse_sala', (salaID) => {
    socket.join(salaID);
    socket.room = salaID;
    socket.to(salaID).emit('oponente_unido');
  });

  socket.on('accion_juego', (datos) => {
    socket.to(datos.sala).emit('actualizar_mesa', datos);
  });

  socket.on('enviar_respuesta', (datos) => {
    socket.to(datos.sala).emit('recibir_respuesta', datos.respuesta);
  });

  socket.on('enviar_foto', (datos) => {
    socket.to(datos.sala).emit('recibir_foto', datos.fotoBase64);
  });

  // NUEVO: Manejar el abandono voluntario o por desconexión
  socket.on('abandonar_partida', (salaID) => {
    if (salaID) {
      socket.to(salaID).emit('oponente_abandono');
    }
  });

  socket.on('disconnect', () => {
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id);
    io.emit('actualizar_lista_espera', jugadoresBuscando);
    if (socket.room) {
      socket.to(socket.room).emit('oponente_abandono');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);