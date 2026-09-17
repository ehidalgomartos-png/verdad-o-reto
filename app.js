
const cities = {
  "Valencia": { current: 347, goal: 500, headline: "Valencia está cerca 👀" },
  "Madrid": { current: 621, goal: 1000, headline: "Madrid se está moviendo 🔥" },
  "Barcelona": { current: 493, goal: 750, headline: "Barcelona va cogiendo ritmo ✨" },
  "Alicante": { current: 184, goal: 400, headline: "Alicante necesita un empujón 👀" },
  "Castellón": { current: 93, goal: 250, headline: "Castellón está empezando 🚀" }
};

const demoProfiles = [
  { name:"Laura", age:25, city:"Valencia", tags:["🎵 Música","🍣 Sushi","✈️ Viajar"], play:"🔥 Verdad o Reto", initials:"LA", c1:"#f45b83", c2:"#6d3eb5" },
  { name:"Carlos", age:29, city:"Valencia", tags:["🏋️ Gym","🎮 Gaming","🐶 Perros"], play:"😈 After Dark", initials:"CA", c1:"#4b80f5", c2:"#49238a" },
  { name:"Marta", age:27, city:"Valencia", tags:["📷 Foto","🎸 Rock","☕ Café"], play:"💬 Conóceme", initials:"MA", c1:"#ff9950", c2:"#a63667" },
  { name:"David", age:31, city:"Valencia", tags:["🍜 Foodie","🏃 Running","🎬 Cine"], play:"🧊 Rompehielos", initials:"DA", c1:"#339c7c", c2:"#175a74" },
  { name:"Nerea", age:24, city:"Madrid", tags:["🎨 Arte","🐱 Gatos","🎧 Techno"], play:"💬 Conóceme", initials:"NE", c1:"#b84cff", c2:"#533cba" },
  { name:"Álex", age:30, city:"Madrid", tags:["⚽ Fútbol","🍕 Pizza","✈️ Viajar"], play:"🔥 Verdad o Reto", initials:"AL", c1:"#f15f79", c2:"#3947ad" },
  { name:"Lucía", age:28, city:"Barcelona", tags:["🌊 Playa","🧘 Yoga","🎥 Series"], play:"🧊 Rompehielos", initials:"LU", c1:"#2fa9a1", c2:"#6049aa" },
  { name:"Marc", age:32, city:"Barcelona", tags:["🚲 Bici","🎵 Indie","🍷 Planes"], play:"😈 After Dark", initials:"MR", c1:"#e47533", c2:"#7f2e65" },
  { name:"Paula", age:26, city:"Alicante", tags:["🌅 Mar","📚 Leer","🐶 Perros"], play:"💬 Conóceme", initials:"PA", c1:"#ec5ca6", c2:"#4d65c7" },
  { name:"Hugo", age:28, city:"Alicante", tags:["🏄 Surf","🎮 Gaming","🍔 Food"], play:"🔥 Verdad o Reto", initials:"HU", c1:"#1eaa9b", c2:"#394f9d" },
  { name:"Andrea", age:27, city:"Castellón", tags:["🎤 Música","🌿 Naturaleza","☕ Café"], play:"🧊 Rompehielos", initials:"AN", c1:"#bc774d", c2:"#703e91" },
  { name:"Sergio", age:33, city:"Castellón", tags:["📷 Foto","🏃 Running","🎬 Cine"], play:"💬 Conóceme", initials:"SE", c1:"#4670c7", c2:"#442878" }
];

const citySelect = document.querySelector("#citySelect");
const formCity = document.querySelector("#formCity");
const peopleGrid = document.querySelector("#peopleGrid");
const lockedAvatars = document.querySelector("#lockedAvatars");

Object.keys(cities).forEach(city => {
  [citySelect, formCity].forEach(select => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    select.appendChild(opt);
  });
});

function renderProfiles(city){
  const exact = demoProfiles.filter(p => p.city === city);
  const fallback = demoProfiles.filter(p => p.city !== city);
  const profiles = [...exact, ...fallback].slice(0, 4);

  peopleGrid.innerHTML = profiles.map(p => `
    <article class="person-card">
      <div class="avatar" style="--c1:${p.c1};--c2:${p.c2}">${p.initials}</div>
      <div class="person-content">
        <div class="person-name">
          <strong>${p.name}, ${p.age}</strong>
          <span class="online-dot" title="En lista"></span>
        </div>
        <div class="person-meta">📍 ${city}</div>
        <div class="tags">${p.tags.map(t => `<span class="tag">${t}</span>`).join("")}</div>
        <div class="play-line">Jugaría: <strong>${p.play}</strong></div>
      </div>
    </article>
  `).join("");
}

function renderLocked(){
  lockedAvatars.innerHTML = Array.from({length:5}).map(() => `<span class="locked-avatar"></span>`).join("");
}
renderLocked();

function updateCity(city){
  const data = cities[city];
  const pct = Math.min(100, Math.round((data.current / data.goal) * 100));
  const remaining = Math.max(0, data.goal - data.current);

  document.querySelector("#cityHeadline").textContent = data.headline;
  document.querySelector("#progressPercent").textContent = `${pct}%`;
  document.querySelector("#progressFill").style.width = `${pct}%`;
  document.querySelector("#currentCount").textContent = data.current;
  document.querySelector("#goalCount").textContent = data.goal;
  document.querySelector("#peopleCity").textContent = city;
  document.querySelector("#hiddenCount").textContent = Math.max(0, data.current - 12);
  document.querySelector("#shareCurrent").textContent = data.current;
  document.querySelector("#shareGoal").textContent = data.goal;
  document.querySelector("#shareRemaining").textContent = remaining;
  formCity.value = city;
  renderProfiles(city);
}

citySelect.addEventListener("change", e => updateCity(e.target.value));
formCity.addEventListener("change", e => {
  citySelect.value = e.target.value;
  updateCity(e.target.value);
});

updateCity("Valencia");

const modal = document.querySelector("#successModal");
const modalClose = document.querySelector("#modalClose");
const waitlistForm = document.querySelector("#waitlistForm");
const refCodeEl = document.querySelector("#refCode");
const refLinkEl = document.querySelector("#refLink");
const copyStatus = document.querySelector("#copyStatus");
const shareButton = document.querySelector("#shareButton");
const copyButton = document.querySelector("#copyButton");

let activeReferralUrl = "";

function makeCode(name, city){
  const clean = (name || "VR").toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ0-9]/g,"").slice(0,5) || "VR";
  const cityPart = city.slice(0,3).toUpperCase();
  const num = Math.floor(100 + Math.random()*900);
  return `VR-${clean}-${cityPart}${num}`;
}

waitlistForm.addEventListener("submit", e => {
  e.preventDefault();
  const data = new FormData(waitlistForm);
  const name = data.get("name");
  const city = data.get("city");
  const code = makeCode(name, city);
  activeReferralUrl = `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}`;

  refCodeEl.textContent = code;
  refLinkEl.textContent = activeReferralUrl;

  // MVP local: guardamos solo en este navegador.
  const entry = {
    name,
    age:data.get("age"),
    city,
    email:data.get("email"),
    publicProfile:Boolean(data.get("publicProfile")),
    code,
    createdAt:new Date().toISOString()
  };
  const existing = JSON.parse(localStorage.getItem("vrmatch_waitlist") || "[]");
  existing.push(entry);
  localStorage.setItem("vrmatch_waitlist", JSON.stringify(existing));

  modal.hidden = false;
  document.body.classList.add("modal-open");
});

function closeModal(){
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  copyStatus.textContent = "";
}
modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", e => { if(e.target === modal) closeModal(); });

copyButton.addEventListener("click", async () => {
  try{
    await navigator.clipboard.writeText(activeReferralUrl);
    copyStatus.textContent = "Enlace copiado ✓";
  }catch{
    copyStatus.textContent = "Copia manualmente el enlace de arriba.";
  }
});

shareButton.addEventListener("click", async () => {
  const city = formCity.value;
  const data = cities[city];
  const remaining = Math.max(0, data.goal - data.current);
  const shareData = {
    title:"V/R Match",
    text:`${city}: faltan ${remaining} personas para desbloquear V/R Match 🔥 ¿Te apuntas?`,
    url:activeReferralUrl
  };

  if(navigator.share){
    try{ await navigator.share(shareData); }catch{}
  }else{
    try{
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      copyStatus.textContent = "Texto de invitación copiado ✓";
    }catch{}
  }
});
