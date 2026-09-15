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
  console.log('¡Nuevo jugador conectado:', socket.id);

  // 1. Unirse a una sala privada
  socket.on('unirse_sala', (salaID) => {
    socket.join(salaID);
    console.log(`Jugador se unió a la sala secreta: ${salaID}`);
    // Avisa al creador de que su amigo ha entrado
    socket.to(salaID).emit('oponente_unido');
  });

  // 2. Enviar carta SOLO al rival de tu sala
  socket.on('accion_juego', (datos) => {
    socket.to(datos.sala).emit('actualizar_mesa', datos);
  });

  // 3. Enviar foto SOLO al rival de tu sala
  socket.on('enviar_foto', (datos) => {
    socket.to(datos.sala).emit('recibir_foto', datos.fotoBase64);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor activo en el puerto ${PORT}`));