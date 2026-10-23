const places = {
  ufg: {
    title: 'UFG · Campus Samambaia', category: 'Educação e conhecimento',
    intro: 'Uma referência universitária na vizinhança acrescenta uma dimensão especial à escolha de onde morar: a possibilidade de aproximar a casa da vida acadêmica.',
    benefits: [
      ['Uma rotina com mais possibilidades', 'Para estudantes, docentes, profissionais e famílias ligados à universidade, a localização pode tornar mais conveniente conciliar moradia e atividades no campus.'],
      ['Um endereço com identidade', 'Ter o Campus Samambaia como referência ajuda a situar o residencial e aproxima sua imagem de educação, pesquisa e formação.'],
      ['Atratividade para diferentes perfis', 'A presença universitária pode despertar o interesse de públicos com necessidades distintas de moradia. É um atributo de localização que pode pesar na escolha do lote.'],
    ],
  },
  esperanca: {
    title: 'Av. Esperança', category: 'Conexão e localização',
    intro: 'A avenida é uma referência do entorno no mapa apresentado. Conhecer as vias próximas ajuda a imaginar a chegada em casa e a organizar os caminhos da rotina.',
    benefits: [
      ['Facilidade para se orientar', 'Uma avenida de referência ajuda moradores, visitantes e prestadores de serviço a localizar a região do residencial.'],
      ['Mobilidade na decisão', 'Observar a relação do loteamento com a avenida permite avaliar os trajetos que fazem sentido para o seu dia a dia.'],
      ['Um atributo do endereço', 'A conexão com a malha urbana é um dos aspectos que podem aumentar a atratividade de um empreendimento para quem busca praticidade.'],
    ],
  },
  ab21: {
    title: 'Rua AB-21', category: 'Vizinhança e caminhos locais',
    intro: 'A Rua AB-21 situa uma das faces do residencial em relação à vizinhança. Ela ajuda a compreender como o loteamento se insere no bairro.',
    benefits: [
      ['Conheça o que existe ao lado', 'Identificar as ruas vizinhas torna mais clara a relação entre o lote escolhido e o entorno urbano.'],
      ['Planeje seus percursos', 'Essa referência permite reconhecer a região e comparar os caminhos locais que atendem à sua rotina.'],
      ['Uma escolha com mais contexto', 'A decisão de compra fica mais completa quando você consegue visualizar tanto a organização interna quanto a vizinhança do empreendimento.'],
    ],
  },
  flamboyant: {
    title: 'Alameda Flamboyant', category: 'Residencial e campus próximos',
    intro: 'No mapa fornecido, a Alameda Flamboyant aparece entre o loteamento e a área da UFG. Ela é uma referência importante para entender essa relação de proximidade.',
    benefits: [
      ['A universidade no seu contexto', 'A posição da Alameda ajuda a visualizar a presença do Campus Samambaia junto ao entorno do residencial.'],
      ['Rotina e localização', 'Para quem frequenta a região universitária, essa relação espacial é um ponto útil ao avaliar onde morar.'],
      ['Mais clareza para escolher', 'Reconhecer a via e os equipamentos vizinhos ajuda a pensar no lote como parte de um endereço e de uma rotina.'],
    ],
  },
  inf: {
    title: 'Instituto de Informática · UFG', category: 'Tecnologia e formação',
    intro: 'O Instituto de Informática é uma das referências da UFG identificadas no mapa apresentado. Sua presença ajuda a reconhecer o caráter universitário do entorno.',
    benefits: [
      ['Conexão com a vida acadêmica', 'A proximidade pode ser especialmente relevante para pessoas que estudam ou trabalham nessa parte da universidade.'],
      ['Um entorno ligado ao conhecimento', 'Uma instituição de ensino e pesquisa agrega identidade acadêmica à região e pode torná-la interessante para diferentes perfis de moradores.'],
      ['Localização que faz sentido para você', 'Se suas atividades estão relacionadas ao campus, essa referência é um elemento concreto para considerar na escolha do endereço.'],
    ],
  },
  letras: {
    title: 'Faculdade de Letras · UFG', category: 'Educação e vida acadêmica',
    intro: 'A Faculdade de Letras é outra referência universitária indicada no mapa do entorno. Ela ajuda a visualizar a relação do residencial com a área acadêmica.',
    benefits: [
      ['Perto do seu universo', 'Quem mantém atividades na universidade pode considerar essa proximidade ao organizar sua rotina de moradia.'],
      ['Identidade universitária', 'A presença de unidades acadêmicas reforça o papel da educação como uma característica reconhecível da região.'],
      ['Uma escolha além do lote', 'Conhecer os pontos próximos permite imaginar como o endereço escolhido se conecta aos lugares que fazem parte da sua vida.'],
    ],
  },
};

export function createSurroundingsUI() {
  const launcher = document.createElement('button');
  launcher.className = 'nearby-launcher'; launcher.type = 'button';
  launcher.innerHTML = '<span aria-hidden="true">⌖</span><span>Conheça o entorno<small>UFG e vias próximas</small></span>';
  launcher.setAttribute('aria-haspopup', 'dialog'); launcher.setAttribute('aria-controls', 'nearby-dialog');
  const dialog = document.createElement('dialog'); dialog.className = 'nearby-dialog'; dialog.id = 'nearby-dialog';
  dialog.setAttribute('aria-labelledby', 'nearby-title');
  dialog.innerHTML = `
    <header class="nearby-header"><div><p class="nearby-eyebrow">O valor de estar bem localizado</p><h2 id="nearby-title"></h2><p class="nearby-category"></p></div><form method="dialog"><button class="nearby-close" aria-label="Fechar informações do entorno" autofocus>×</button></form></header>
    <div class="nearby-scroll"><nav class="nearby-tabs" aria-label="Referências do entorno"></nav><p class="nearby-intro"></p><div class="nearby-benefits"></div><p class="nearby-note">Benefícios de localização apresentados de forma qualitativa, sem estimativa de valorização financeira. As construções e vias do entorno são ilustrativas.</p><form method="dialog"><button class="nearby-return">Voltar à maquete <span aria-hidden="true">↗</span></button></form></div>
  `;
  document.body.append(launcher, dialog);
  const tabs = dialog.querySelector('.nearby-tabs'), list = dialog.querySelector('.nearby-benefits');
  for (const [id, place] of Object.entries(places)) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.place = id;
    button.textContent = id === 'ufg' ? 'UFG' : id === 'inf' ? 'Informática' : id === 'letras' ? 'Letras' : place.title;
    button.addEventListener('click', () => open(id)); tabs.appendChild(button);
  }
  function open(id = 'ufg') {
    const place = places[id]; if (!place) return;
    dialog.querySelector('#nearby-title').textContent = place.title;
    dialog.querySelector('.nearby-category').textContent = place.category;
    dialog.querySelector('.nearby-intro').textContent = place.intro;
    list.replaceChildren(...place.benefits.map(([title, text], index) => {
      const article = document.createElement('article'), number = document.createElement('span'), content = document.createElement('div');
      const heading = document.createElement('h3'), description = document.createElement('p');
      number.className = 'nearby-number'; number.textContent = String(index + 1).padStart(2, '0');
      heading.textContent = title; description.textContent = text; content.append(heading, description); article.append(number, content); return article;
    }));
    tabs.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.place === id)));
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.nearby-scroll').scrollTop = 0;
  }
  launcher.addEventListener('click', () => open());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  return { open, isOpen: () => dialog.open, setAvailable(available) { launcher.hidden = !available; if (!available && dialog.open) dialog.close(); } };
}
