const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Sirve la página web principal
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Gestión de conexiones y turnos
io.on('connection', (socket) => {
  console.log('¡Nuevo jugador conectado:', socket.id);

  // Reenvía la acción elegida (Verdad o Reto) al oponente
  socket.on('accion_juego', (tipoAccion) => {
    socket.broadcast.emit('actualizar_mesa', tipoAccion);
  });

  // Reenvía la foto-prueba al oponente
  socket.on('enviar_foto', (fotoBase64) => {
    socket.broadcast.emit('recibir_foto', fotoBase64);
  });

  socket.on('disconnect', () => {
    console.log('Un jugador se ha desconectado');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor activo en el puerto ${PORT}`));