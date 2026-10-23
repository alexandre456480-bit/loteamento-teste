# Parque Universitário · Maquete 3D

Aplicação estática com Vite e Three.js.

## Executar localmente

Requer Node.js 22.

```sh
npm ci
npm run dev
```

## Publicar na Vercel

Importe este repositório com a pasta raiz `./`. A configuração está em `vercel.json`:

- Framework: Vite
- Instalação: `npm ci`
- Build: `npm run build`
- Pasta de saída: `dist`
- Node.js: 22.x

Os links `/lote/Q01-L01` são encaminhados para a aplicação, preservando os arquivos estáticos.

O repositório inclui o código e os recursos usados pela aplicação: geometria, catálogo, recortes das plantas dos lotes e imagem de referência. Dependências instaladas, arquivos de análise e documentos de trabalho ficam fora da publicação.

O envio de interesses a um serviço externo depende da configuração de `contact.leadEndpoint` no catálogo. Sem esse endereço, a aplicação salva o interesse apenas no navegador.
