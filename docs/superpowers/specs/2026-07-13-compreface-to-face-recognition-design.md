# Migracao do CompreFace para Face Recognition

Data: 2026-07-13
Status: aguardando aprovacao

## Objetivo

Remover completamente o CompreFace da aplicacao depois de migrar as fotos ja cadastradas para o banco do RPVP, mantendo cada foto associada ao usuario correto.

A migracao usara o dump PostgreSQL do CompreFace em `C:/Users/isaac.teixeira/Downloads/compreface.dump`. O dump foi inspecionado e contem as tabelas necessarias:

- `subject(id uuid, api_key varchar(36), subject_name varchar(255))`
- `img(id uuid, content bytea)`
- `embedding(id uuid, subject_id uuid, embedding double precision[], calculator varchar(255), img_id uuid)`

O embedding antigo do CompreFace nao sera reaproveitado. Ele pertence ao modelo antigo. A tabela `embedding` do dump sera usada apenas para relacionar `subject` com `img`.

## Decisao Aprovada Para a Proposta

Usar uma tabela simples no banco do RPVP chamada `usuarios_faces`.

Ela guardara:

- o usuario dono da foto;
- a foto em `bytea`;
- o embedding calculado pelo novo motor;
- o tipo de conteudo da imagem;
- a data da ultima atualizacao.

Nao sera criado campo de origem da foto, porque essa informacao nao e relevante para a operacao futura.

## Tabela Proposta

Adicionar ao `db/init.sql`:

```sql
CREATE TABLE IF NOT EXISTS usuarios_faces (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  face BYTEA NOT NULL,
  embedding DOUBLE PRECISION[],
  content_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usuarios_faces_usuario_id
  ON usuarios_faces (usuario_id);
```

### Por que manter `id`

O CompreFace permitia varias faces/fotos por pessoa. Se `usuario_id` fosse chave primaria, ficariamos limitados a uma foto por usuario. Com `id`, cada usuario pode ter varias fotos cadastradas.

### Por que salvar `embedding`

O `face_recognition` precisa transformar a imagem em um encoding facial antes de comparar. Esse valor pode ser recalculado a partir da imagem, mas salvar o embedding evita recalcular todas as fotos a cada reconhecimento.

Fluxo desejado:

1. A foto fica salva em `usuarios_faces.face`.
2. O novo motor calcula o embedding.
3. O embedding fica salvo em `usuarios_faces.embedding`.
4. No reconhecimento, a imagem nova e comparada contra os embeddings salvos.

## Novo Servico de Reconhecimento

Criar um container separado chamado `face-recognition`.

Stack proposta:

- Python
- FastAPI
- `face_recognition`
- Uvicorn

Esse container nao sera publico. Apenas o backend Node acessara esse servico pela rede Docker.

Servicos finais no `docker-compose.yml`:

- `postgres`
- `backend`
- `frontend`
- `cloudflared`
- `face-recognition`

## Contrato Inicial do `face-recognition`

### `GET /health`

Verifica se o servico esta no ar.

Resposta esperada:

```json
{
  "success": true,
  "engine": "face_recognition"
}
```

### `POST /encode`

Recebe uma imagem e retorna o embedding calculado.

Entrada:

- `multipart/form-data`
- campo `file`

Resposta esperada:

```json
{
  "success": true,
  "faceFound": true,
  "embedding": [0.1, 0.2],
  "dimensions": 128
}
```

Erros esperados:

- nenhuma face encontrada;
- mais de uma face na imagem;
- imagem invalida.

### `POST /recognize`

Recebe a imagem capturada no check-in/check-out e uma lista de embeddings cadastrados.

Entrada conceitual:

```json
{
  "candidates": [
    {
      "usuarioId": 1,
      "faceId": 10,
      "embedding": [0.1, 0.2]
    }
  ]
}
```

Mais o arquivo da imagem via multipart, ou uma chamada equivalente definida na implementacao.

Resposta esperada:

```json
{
  "success": true,
  "faceFound": true,
  "recognized": true,
  "usuarioId": 1,
  "faceId": 10,
  "distance": 0.42
}
```

Observacao: a comparacao numerica deve ficar no Python, junto com o motor facial. O backend Node continua cuidando das regras de sessao, presenca, permissao e auditoria.

## Mudancas no Backend Node

### Remover CompreFace

Remover a dependencia operacional e textual de:

- `COMPREFACE_URL`
- `COMPREFACE_API_KEY`
- `COMPREFACE_SIMILARITY_THRESHOLD`
- `COMPREFACE_TIMEOUT_MS`
- `compreFaceService.js`
- endpoint `/compreface/faces/:imageId/img`
- textos de UI e docs citando CompreFace como motor ativo

### Criar `faceRecognitionService.js`

Novo service no backend para falar com o container Python.

Responsabilidades:

- enviar imagem para `/encode`;
- enviar imagem e candidatos para `/recognize`;
- normalizar respostas;
- converter erros do motor facial para erros HTTP claros.

Variaveis novas sugeridas:

```env
FACE_RECOGNITION_URL=http://face-recognition:8000
FACE_RECOGNITION_THRESHOLD=0.6
FACE_RECOGNITION_TIMEOUT_MS=15000
```

### Usar `usuarios_faces`

O backend passa a:

- cadastrar fotos em `usuarios_faces`;
- gerar embedding no momento do cadastro;
- listar fotos de `usuarios_faces`;
- remover fotos de `usuarios_faces`;
- carregar candidatos com `embedding IS NOT NULL` para reconhecimento.

## Migracao das Fotos do CompreFace

Voce preparara os inserts com base no dump do CompreFace.

Consulta base no banco do CompreFace:

```sql
SELECT
  s.subject_name,
  i.content AS face
FROM subject s
JOIN embedding e ON e.subject_id = s.id
JOIN img i ON i.id = e.img_id
WHERE s.subject_name IS NOT NULL
  AND i.content IS NOT NULL;
```

Depois, fazer o de/para:

```text
subject.subject_name -> usuarios.id
```

Insert final no banco RPVP:

```sql
INSERT INTO usuarios_faces (usuario_id, face, content_type, atualizado_em)
VALUES ($1, $2, 'image/jpeg', CURRENT_TIMESTAMP);
```

Depois de importar as fotos, rodar uma rotina de reprocessamento:

1. Buscar registros em `usuarios_faces` com `embedding IS NULL`.
2. Enviar `face` para `face-recognition /encode`.
3. Atualizar `embedding`.
4. Registrar ou exibir fotos que nao geraram embedding valido.

## Fluxo de Cadastro Manual Futuro

Quando um admin adicionar uma nova foto pela tela de usuarios:

1. Backend recebe upload.
2. Backend envia imagem ao `face-recognition /encode`.
3. Se uma face valida for encontrada, grava `face` e `embedding` em `usuarios_faces`.
4. A tela atualiza a lista de fotos do usuario.

## Fluxo de Reconhecimento Futuro

1. Frontend captura foto apos piscada.
2. Backend busca candidatos:

```sql
SELECT
  uf.id AS face_id,
  uf.usuario_id,
  uf.embedding
FROM usuarios_faces uf
JOIN usuarios u ON u.id = uf.usuario_id
WHERE u.ativo = true
  AND uf.embedding IS NOT NULL;
```

3. Backend envia foto capturada e candidatos ao `face-recognition /recognize`.
4. Se reconhecido, o backend usa `usuario_id` retornado.
5. O fluxo atual de check-in/check-out continua em `presencaService`.

## Alteracoes no Frontend

Manter a tela de usuarios com a mesma funcao geral:

- listar faces do usuario;
- adicionar fotos;
- remover foto;
- exibir miniatura da foto.

Mudancas visiveis:

- trocar "CompreFace" por "biometria facial", "faces cadastradas" ou "colecao facial";
- remover mensagens como "enviado ao CompreFace";
- apontar imagens para endpoint neutro, por exemplo `/usuarios/:id/faces/:faceId/img` ou `/faces/:faceId/img`.

## Arquivos Impactados

Backend:

- `backend/src/services/compreFaceService.js`
- `backend/src/services/faceRecognitionService.js`
- `backend/src/controllers/reconhecerController.js`
- `backend/src/routes/reconhecer.js`
- `backend/src/config/env.js`
- `backend/src/middleware/upload.js`
- `backend/package.json`
- `backend/Dockerfile`

Novo servico:

- `face-recognition/Dockerfile`
- `face-recognition/requirements.txt`
- `face-recognition/app.py`

Banco/config:

- `db/init.sql`
- `docker-compose.yml`
- `.env.example`

Frontend/docs:

- `frontend/pages/usuarios.html`
- `frontend/scripts/usuarios.js`
- `README.md`
- `docs/*.md`

## Criterios de Aceite

A implementacao sera aceita quando:

- O compose subir sem CompreFace.
- O backend subir sem variaveis `COMPREFACE_*`.
- A tabela `usuarios_faces` existir no init do banco.
- Fotos migradas estiverem associadas aos usuarios corretos.
- Rotina de reprocessamento preencher `embedding` para fotos validas.
- Fotos invalidas forem reportadas sem quebrar a migracao inteira.
- Tela de usuarios listar, adicionar e remover fotos.
- Reconhecimento facial registrar presenca usando o novo motor.
- Textos visiveis e documentacao nao tratarem CompreFace como dependencia ativa.

## Pontos Para Voce Aprovar ou Modificar

1. Nome da tabela: `usuarios_faces`.
2. Colunas: `id`, `usuario_id`, `face`, `embedding`, `content_type`, `atualizado_em`.
3. Novo container: `face-recognition`.
4. Motor inicial: `face_recognition`.
5. Uma pessoa pode ter varias fotos.
6. Voce preparara/importara os inserts iniciais de `usuario_id` + `face`, e a aplicacao reprocessara os embeddings depois.

