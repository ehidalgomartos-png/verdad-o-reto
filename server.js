const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
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
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);