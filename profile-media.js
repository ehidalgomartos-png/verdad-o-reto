(() => {
  const MAX_SECONDS = 30;
  const root = document.querySelector('[data-profile-media]');
  if (!root) return;

  const els = {
    photoInput: root.querySelector('[data-photo-input]'),
    profileImg: root.querySelector('[data-profile-img]'),
    profileInitials: root.querySelector('[data-profile-initials]'),
    removePhoto: root.querySelector('[data-remove-photo]'),
    avatarGrid: root.querySelector('[data-avatar-grid]'),
    liveVideo: root.querySelector('[data-live-video]'),
    previewVideo: root.querySelector('[data-preview-video]'),
    placeholder: root.querySelector('[data-camera-placeholder]'),
    recordingBadge: root.querySelector('[data-recording-badge]'),
    timer: root.querySelector('[data-timer]'),
    status: root.querySelector('[data-status]'),
    openCamera: root.querySelector('[data-open-camera]'),
    switchCamera: root.querySelector('[data-switch-camera]'),
    startRecording: root.querySelector('[data-start-recording]'),
    stopRecording: root.querySelector('[data-stop-recording]'),
    retake: root.querySelector('[data-retake]'),
    useVideo: root.querySelector('[data-use-video]')
  };

  let stream = null;
  let recorder = null;
  let chunks = [];
  let recordedBlob = null;
  let recordedUrl = null;
  let timerInterval = null;
  let startedAt = null;
  let facingMode = 'user';

  function setStatus(message = '', type = '') {
    els.status.textContent = message;
    els.status.classList.toggle('is-error', type === 'error');
    els.status.classList.toggle('is-success', type === 'success');
  }

  function formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.min(MAX_SECONDS, Math.floor(totalSeconds)));
    return `00:${String(seconds).padStart(2, '0')} / 00:${MAX_SECONDS}`;
  }

  function setTimer(seconds = 0) {
    els.timer.textContent = formatTime(seconds);
  }

  function clearTimer() {
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = null;
  }

  function stopTracks() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    els.liveVideo.srcObject = null;
  }

  async function openCamera() {
    clearTimer();
    setTimer(0);
    setStatus('Solicitando acceso a cámara y micrófono…');

    try {
      stopTracks();
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      });

      els.liveVideo.srcObject = stream;
      els.liveVideo.hidden = false;
      els.previewVideo.hidden = true;
      els.placeholder.hidden = true;
      els.openCamera.hidden = true;
      els.startRecording.hidden = false;
      els.retake.hidden = true;
      els.useVideo.hidden = true;

      const cameras = (await navigator.mediaDevices.enumerateDevices())
        .filter(device => device.kind === 'videoinput');
      els.switchCamera.hidden = cameras.length < 2;

      setStatus('Cámara lista. La grabación se detendrá automáticamente a los 30 segundos.');
    } catch (error) {
      console.error(error);
      setStatus('No se pudo abrir la cámara. Revisa los permisos de cámara y micrófono.', 'error');
      els.openCamera.hidden = false;
    }
  }

  function bestMimeType() {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return candidates.find(type => window.MediaRecorder?.isTypeSupported(type)) || '';
  }

  function startRecording() {
    if (!stream) {
      setStatus('Primero abre la cámara.', 'error');
      return;
    }

    chunks = [];
    recordedBlob = null;
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    recordedUrl = null;

    const mimeType = bestMimeType();

    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (error) {
      console.error(error);
      setStatus('Este navegador no permite grabar vídeo con MediaRecorder.', 'error');
      return;
    }

    recorder.addEventListener('dataavailable', event => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    });

    recorder.addEventListener('stop', () => {
      clearTimer();
      const type = recorder.mimeType || mimeType || 'video/webm';
      recordedBlob = new Blob(chunks, { type });
      recordedUrl = URL.createObjectURL(recordedBlob);

      els.previewVideo.src = recordedUrl;
      els.previewVideo.hidden = false;
      els.liveVideo.hidden = true;

      els.recordingBadge.hidden = true;
      els.stopRecording.hidden = true;
      els.startRecording.hidden = true;
      els.switchCamera.hidden = true;
      els.retake.hidden = false;
      els.useVideo.hidden = false;

      const duration = Math.min(MAX_SECONDS, (Date.now() - startedAt) / 1000);
      setTimer(duration);
      stopTracks();
      setStatus('Vídeo grabado. Puedes repetirlo o usar esta toma.');
    });

    recorder.start(250);
    startedAt = Date.now();
    els.recordingBadge.hidden = false;
    els.startRecording.hidden = true;
    els.switchCamera.hidden = true;
    els.stopRecording.hidden = false;
    setStatus('Grabando… máximo 30 segundos.');

    timerInterval = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setTimer(elapsed);
      if (elapsed >= MAX_SECONDS && recorder?.state === 'recording') {
        recorder.stop();
      }
    }, 100);
  }

  function stopRecording() {
    if (recorder?.state === 'recording') recorder.stop();
  }

  async function switchCamera() {
    if (recorder?.state === 'recording') return;
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    await openCamera();
  }

  async function retake() {
    els.previewVideo.pause();
    els.previewVideo.removeAttribute('src');
    els.previewVideo.load();
    recordedBlob = null;
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    recordedUrl = null;
    els.retake.hidden = true;
    els.useVideo.hidden = true;
    await openCamera();
  }

  function useVideo() {
    if (!recordedBlob) return;

    // Integra aquí tu subida al backend si la aplicación ya dispone de API.
    // Ejemplo:
    // const formData = new FormData();
    // formData.append('video', recordedBlob, 'video-perfil.webm');
    // fetch('/api/profile/video', { method: 'POST', body: formData });

    root.dispatchEvent(new CustomEvent('profileVideoRecorded', {
      bubbles: true,
      detail: {
        blob: recordedBlob,
        mimeType: recordedBlob.type,
        maxDurationSeconds: MAX_SECONDS
      }
    }));

    setStatus('Vídeo seleccionado correctamente.', 'success');
  }

  els.photoInput.addEventListener('change', () => {
    const file = els.photoInput.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStatus('Selecciona un archivo de imagen válido.', 'error');
      els.photoInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      els.profileImg.src = reader.result;
      els.profileImg.hidden = false;
      els.profileInitials.hidden = true;
      root.querySelectorAll('.avatar').forEach(a => a.classList.remove('is-selected'));

      root.dispatchEvent(new CustomEvent('profilePhotoSelected', {
        bubbles: true,
        detail: { file }
      }));

      setStatus('Foto de perfil seleccionada.', 'success');
    };
    reader.readAsDataURL(file);
  });

  els.removePhoto.addEventListener('click', () => {
    els.photoInput.value = '';
    els.profileImg.removeAttribute('src');
    els.profileImg.hidden = true;
    els.profileInitials.textContent = 'SM';
    els.profileInitials.hidden = false;
    root.querySelectorAll('.avatar').forEach(a => a.classList.remove('is-selected'));
    setStatus('Foto eliminada.');
  });

  els.avatarGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-avatar]');
    if (!button) return;

    const avatar = button.dataset.avatar;
    els.photoInput.value = '';
    els.profileImg.hidden = true;
    els.profileImg.removeAttribute('src');
    els.profileInitials.textContent = avatar;
    els.profileInitials.hidden = false;

    root.querySelectorAll('.avatar').forEach(a => a.classList.remove('is-selected'));
    button.classList.add('is-selected');

    root.dispatchEvent(new CustomEvent('profileAvatarSelected', {
      bubbles: true,
      detail: { avatar }
    }));

    setStatus('Avatar seleccionado.', 'success');
  });

  els.openCamera.addEventListener('click', openCamera);
  els.switchCamera.addEventListener('click', switchCamera);
  els.startRecording.addEventListener('click', startRecording);
  els.stopRecording.addEventListener('click', stopRecording);
  els.retake.addEventListener('click', retake);
  els.useVideo.addEventListener('click', useVideo);

  window.addEventListener('beforeunload', () => {
    clearTimer();
    stopTracks();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  });

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    els.openCamera.disabled = true;
    setStatus('Este navegador no soporta la grabación directa desde cámara.', 'error');
  }

  setTimer(0);
})();
