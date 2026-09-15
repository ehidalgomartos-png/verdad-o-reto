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

let jugadoresBuscando = [];

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  socket.on('entrar_lobby', (nombre) => {
    socket.nombre = nombre || 'Anónimo';
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id);
    jugadoresBuscando.push({ id: socket.id, nombre: socket.nombre });
    io.emit('actualizar_lista_espera', jugadoresBuscando);
  });

  // Recibe el ID del oponente y el mazo seleccionado
  socket.on('retar_jugador', (data) => {
    const salaID = 'sala_' + Math.random().toString(36).substring(2, 9);
    const ofertadoID = data.oponenteID;
    const mazoElegido = data.mazo || 'rompehielos';
    
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id && j.id !== ofertadoID);
    io.emit('actualizar_lista_espera', jugadoresBuscando);

    socket.join(salaID);
    
    const oponenteSocket = io.sockets.sockets.get(ofertadoID);
    if (oponenteSocket) {
      oponenteSocket.join(salaID);
      io.to(salaID).emit('partida_iniciada', { 
        salaID: salaID, 
        creadorID: socket.id, 
        mazo: mazoElegido 
      });
    }
  });

  socket.on('unirse_sala', (salaID) => {
    socket.join(salaID);
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

  socket.on('disconnect', () => {
    jugadoresBuscando = jugadoresBuscando.filter(j => j.id !== socket.id);
    io.emit('actualizar_lista_espera', jugadoresBuscando);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);