--
-- PostgreSQL database dump
--

-- Dumped from database version 11.5 (Debian 11.5-3.pgdg90+1)
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: vianapeixoto
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO vianapeixoto;

SET default_tablespace = '';

--
-- Name: configuracoes; Type: TABLE; Schema: public; Owner: vianapeixoto
--

CREATE TABLE public.configuracoes (
    chave character varying(80) NOT NULL,
    valor text NOT NULL,
    tipo character varying(10) DEFAULT 'string'::character varying NOT NULL,
    descricao text,
    atualizado_em timestamp with time zone DEFAULT now()
);


ALTER TABLE public.configuracoes OWNER TO vianapeixoto;

--
-- Name: presencas; Type: TABLE; Schema: public; Owner: vianapeixoto
--

CREATE TABLE public.presencas (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    data date NOT NULL,
    hora timestamp without time zone NOT NULL,
    similaridade numeric(5,4),
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sessao_id integer,
    check_in_em timestamp without time zone,
    check_out_em timestamp without time zone
);


ALTER TABLE public.presencas OWNER TO vianapeixoto;

--
-- Name: presencas_id_seq; Type: SEQUENCE; Schema: public; Owner: vianapeixoto
--

CREATE SEQUENCE public.presencas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.presencas_id_seq OWNER TO vianapeixoto;

--
-- Name: presencas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vianapeixoto
--

ALTER SEQUENCE public.presencas_id_seq OWNED BY public.presencas.id;


--
-- Name: presencas_imagens; Type: TABLE; Schema: public; Owner: vianapeixoto
--

CREATE TABLE public.presencas_imagens (
    id integer NOT NULL,
    presenca_id integer NOT NULL,
    foto bytea NOT NULL,
    content_type character varying(100) DEFAULT 'image/jpeg'::character varying NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tipo_registro character varying(20) DEFAULT 'checkin'::character varying NOT NULL
);


ALTER TABLE public.presencas_imagens OWNER TO vianapeixoto;

--
-- Name: presencas_imagens_id_seq; Type: SEQUENCE; Schema: public; Owner: vianapeixoto
--

CREATE SEQUENCE public.presencas_imagens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.presencas_imagens_id_seq OWNER TO vianapeixoto;

--
-- Name: presencas_imagens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vianapeixoto
--

ALTER SEQUENCE public.presencas_imagens_id_seq OWNED BY public.presencas_imagens.id;


--
-- Name: sessoes; Type: TABLE; Schema: public; Owner: vianapeixoto
--

CREATE TABLE public.sessoes (
    id integer NOT NULL,
    nome character varying(160) NOT NULL,
    descricao text,
    data date NOT NULL,
    local character varying(180),
    instrutor_id integer,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    inicio_efetivo_em timestamp without time zone,
    fim_efetivo_em timestamp without time zone,
    tipo_sessao character varying(80),
    checkout_habilitado boolean DEFAULT false NOT NULL
);


ALTER TABLE public.sessoes OWNER TO vianapeixoto;

--
-- Name: sessoes_id_seq; Type: SEQUENCE; Schema: public; Owner: vianapeixoto
--

CREATE SEQUENCE public.sessoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sessoes_id_seq OWNER TO vianapeixoto;

--
-- Name: sessoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vianapeixoto
--

ALTER SEQUENCE public.sessoes_id_seq OWNED BY public.sessoes.id;


--
-- Name: setores; Type: TABLE; Schema: public; Owner: vianapeixoto
--

CREATE TABLE public.setores (
    id integer NOT NULL,
    nome character varying(120) NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.setores OWNER TO vianapeixoto;

--
-- Name: setores_id_seq; Type: SEQUENCE; Schema: public; Owner: vianapeixoto
--

CREATE SEQUENCE public.setores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.setores_id_seq OWNER TO vianapeixoto;

--
-- Name: setores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vianapeixoto
--

ALTER SEQUENCE public.setores_id_seq OWNED BY public.setores.id;


--
-- Name: tipos_sessao; Type: TABLE; Schema: public; Owner: vianapeixoto
--

CREATE TABLE public.tipos_sessao (
    id integer NOT NULL,
    nome character varying(80) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


ALTER TABLE public.tipos_sessao OWNER TO vianapeixoto;

--
-- Name: tipos_sessao_id_seq; Type: SEQUENCE; Schema: public; Owner: vianapeixoto
--

CREATE SEQUENCE public.tipos_sessao_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tipos_sessao_id_seq OWNER TO vianapeixoto;

--
-- Name: tipos_sessao_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vianapeixoto
--

ALTER SEQUENCE public.tipos_sessao_id_seq OWNED BY public.tipos_sessao.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: vianapeixoto
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nome_completo character varying(255) NOT NULL,
    subject character varying(255) NOT NULL,
    usuario character varying(60),
    senha_hash text,
    perfil_acesso character varying(30) DEFAULT 'colaborador'::character varying NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ativo boolean DEFAULT true NOT NULL,
    gestor_id integer,
    ultimo_login_em timestamp without time zone,
    cpf character varying(11),
    reset_senha_primeiro_acesso boolean DEFAULT false NOT NULL,
    setor_id integer,
    CONSTRAINT usuarios_perfil_acesso_chk CHECK (((perfil_acesso)::text = ANY ((ARRAY['admin'::character varying, 'instrutor'::character varying, 'gestor'::character varying, 'colaborador'::character varying])::text[]))),
    CONSTRAINT usuarios_usuario_formato_chk CHECK (((usuario IS NULL) OR ((usuario)::text ~* '^[A-Z0-9._-]{3,60}$'::text) OR ((usuario)::text ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'::text)))
);


ALTER TABLE public.usuarios OWNER TO vianapeixoto;

--
-- Name: usuarios_faces; Type: TABLE; Schema: public; Owner: vianapeixoto
--

CREATE TABLE public.usuarios_faces (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    face bytea NOT NULL,
    embedding double precision[],
    content_type character varying(100) DEFAULT 'image/jpeg'::character varying NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.usuarios_faces OWNER TO vianapeixoto;

CREATE SEQUENCE public.usuarios_faces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.usuarios_faces_id_seq OWNER TO vianapeixoto;
ALTER SEQUENCE public.usuarios_faces_id_seq OWNED BY public.usuarios_faces.id;

--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: vianapeixoto
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usuarios_id_seq OWNER TO vianapeixoto;

--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vianapeixoto
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: presencas id; Type: DEFAULT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.presencas ALTER COLUMN id SET DEFAULT nextval('public.presencas_id_seq'::regclass);


--
-- Name: presencas_imagens id; Type: DEFAULT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.presencas_imagens ALTER COLUMN id SET DEFAULT nextval('public.presencas_imagens_id_seq'::regclass);


--
-- Name: sessoes id; Type: DEFAULT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.sessoes ALTER COLUMN id SET DEFAULT nextval('public.sessoes_id_seq'::regclass);


--
-- Name: setores id; Type: DEFAULT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.setores ALTER COLUMN id SET DEFAULT nextval('public.setores_id_seq'::regclass);


--
-- Name: tipos_sessao id; Type: DEFAULT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.tipos_sessao ALTER COLUMN id SET DEFAULT nextval('public.tipos_sessao_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: usuarios_faces id; Type: DEFAULT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.usuarios_faces ALTER COLUMN id SET DEFAULT nextval('public.usuarios_faces_id_seq'::regclass);


--
-- Data for Name: configuracoes; Type: TABLE DATA; Schema: public; Owner: vianapeixoto
--

COPY public.configuracoes (chave, valor, tipo, descricao, atualizado_em) FROM stdin;
cooldown_entre_tentativas_ms	10000	integer	Cooldown em milissegundos entre tentativas de reconhecimento facial	2026-04-22 21:08:01.47216+00
frames_fechado_min	2	integer	Frames consecutivos com EAR fechado para validar o estado	2026-04-22 21:08:01.47216+00
frames_aberto_min	2	integer	Frames consecutivos com EAR aberto para validar o estado	2026-04-22 21:08:01.47216+00
atraso_pos_piscada_ms	700	integer	Atraso em milissegundos entre detectar a piscada e capturar a foto	2026-04-22 21:08:01.47216+00
checkout_obrigatorio	false	boolean	Exige checkout facial para considerar a presença como concluída	2026-04-22 21:08:01.47216+00
min_checkout_intervalo_seg	180	integer	Intervalo mínimo em segundos entre check-in e checkout	2026-04-22 21:08:01.47216+00
limiar_similaridade	0.92	decimal	Limiar de similaridade para aceitar o reconhecimento facial (0.0 – 1.0)	2026-04-22 21:08:01.47216+00
ear_fechado	0.20	decimal	EAR abaixo do qual o olho é considerado fechado na detecção de piscada	2026-04-22 21:08:01.47216+00
ear_aberto	0.25	decimal	EAR acima do qual o olho é considerado aberto na detecção de piscada	2026-04-22 21:08:01.47216+00
area_minima_rosto	0.06	decimal	Fração mínima do frame que o rosto deve ocupar (rejeita rostos distantes)	2026-04-22 21:08:01.47216+00
limite_exportacao	10000	integer	Número máximo de linhas permitido por exportação (PDF/Excel)	2026-04-22 21:08:01.47216+00
ttl_token_horas	12	integer	Tempo de vida do token de autenticação em horas	2026-04-22 21:08:01.47216+00
\.


--
-- Data for Name: presencas; Type: TABLE DATA; Schema: public; Owner: vianapeixoto
--

COPY public.presencas (id, usuario_id, data, hora, similaridade, criado_em, sessao_id, check_in_em, check_out_em) FROM stdin;
\.


--
-- Data for Name: presencas_imagens; Type: TABLE DATA; Schema: public; Owner: vianapeixoto
--

COPY public.presencas_imagens (id, presenca_id, foto, content_type, criado_em, atualizado_em, tipo_registro) FROM stdin;
\.


--
-- Data for Name: sessoes; Type: TABLE DATA; Schema: public; Owner: vianapeixoto
--

COPY public.sessoes (id, nome, descricao, data, local, instrutor_id, criado_em, atualizado_em, inicio_efetivo_em, fim_efetivo_em, tipo_sessao, checkout_habilitado) FROM stdin;
\.


--
-- Data for Name: setores; Type: TABLE DATA; Schema: public; Owner: vianapeixoto
--

COPY public.setores (id, nome, criado_em, atualizado_em) FROM stdin;
\.


--
-- Data for Name: tipos_sessao; Type: TABLE DATA; Schema: public; Owner: vianapeixoto
--

COPY public.tipos_sessao (id, nome, ativo, criado_em) FROM stdin;
\.


--
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: vianapeixoto
--

COPY public.usuarios (id, nome_completo, subject, usuario, senha_hash, perfil_acesso, criado_em, atualizado_em, ativo, gestor_id, ultimo_login_em, cpf, reset_senha_primeiro_acesso, setor_id) FROM stdin;
1	Viana Peixoto	Viana Peixoto	viana.peixoto	pbkdf2$120000$sha512$524f347e5367c94e3111fd0119dc3c254f4a141e0ff58b81f04c058f46901b80792fc0aed60b0d4613005bcf196a753cec7df7c0708cda29c2bc9bdb00f00649	admin	2026-04-22 18:22:19.983	2026-04-23 10:17:53.343826	t	\N	2026-04-23 10:17:53.343826	00000000000	f	\N
\.


--
-- Name: presencas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: vianapeixoto
--

SELECT pg_catalog.setval('public.presencas_id_seq', 1, false);


--
-- Name: presencas_imagens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: vianapeixoto
--

SELECT pg_catalog.setval('public.presencas_imagens_id_seq', 1, false);


--
-- Name: sessoes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: vianapeixoto
--

SELECT pg_catalog.setval('public.sessoes_id_seq', 1, false);


--
-- Name: setores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: vianapeixoto
--

SELECT pg_catalog.setval('public.setores_id_seq', 1, false);


--
-- Name: tipos_sessao_id_seq; Type: SEQUENCE SET; Schema: public; Owner: vianapeixoto
--

SELECT pg_catalog.setval('public.tipos_sessao_id_seq', 1, false);


--
-- Name: usuarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: vianapeixoto
--

SELECT pg_catalog.setval('public.usuarios_id_seq', 1, true);


--
-- Name: configuracoes configuracoes_pkey; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.configuracoes
    ADD CONSTRAINT configuracoes_pkey PRIMARY KEY (chave);


--
-- Name: presencas_imagens presencas_imagens_pkey; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.presencas_imagens
    ADD CONSTRAINT presencas_imagens_pkey PRIMARY KEY (id);


--
-- Name: presencas presencas_pkey; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.presencas
    ADD CONSTRAINT presencas_pkey PRIMARY KEY (id);


--
-- Name: sessoes sessoes_pkey; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.sessoes
    ADD CONSTRAINT sessoes_pkey PRIMARY KEY (id);


--
-- Name: setores setores_nome_key; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.setores
    ADD CONSTRAINT setores_nome_key UNIQUE (nome);


--
-- Name: setores setores_pkey; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.setores
    ADD CONSTRAINT setores_pkey PRIMARY KEY (id);


--
-- Name: tipos_sessao tipos_sessao_nome_key; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.tipos_sessao
    ADD CONSTRAINT tipos_sessao_nome_key UNIQUE (nome);


--
-- Name: tipos_sessao tipos_sessao_pkey; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.tipos_sessao
    ADD CONSTRAINT tipos_sessao_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios_faces usuarios_faces_pkey; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.usuarios_faces
    ADD CONSTRAINT usuarios_faces_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_subject_key; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_subject_key UNIQUE (subject);


--
-- Name: usuarios_cpf_unique_idx; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE UNIQUE INDEX usuarios_cpf_unique_idx ON public.usuarios USING btree (cpf) WHERE (cpf IS NOT NULL);


--
-- Name: ux_presencas_imagens_presenca_tipo; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE UNIQUE INDEX ux_presencas_imagens_presenca_tipo ON public.presencas_imagens USING btree (presenca_id, tipo_registro);


--
-- Name: idx_presencas_check_out; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_presencas_check_out ON public.presencas USING btree (check_out_em);


--
-- Name: idx_presencas_data; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_presencas_data ON public.presencas USING btree (data);


--
-- Name: idx_presencas_sessao_id; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_presencas_sessao_id ON public.presencas USING btree (sessao_id);


--
-- Name: idx_presencas_usuario_id; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_presencas_usuario_id ON public.presencas USING btree (usuario_id);


--
-- Name: idx_presencas_unica_usuario_data_sessao; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE UNIQUE INDEX idx_presencas_unica_usuario_data_sessao ON public.presencas USING btree (usuario_id, data, COALESCE(sessao_id, 0));


--
-- Name: idx_presencas_imagens_presenca_id; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_presencas_imagens_presenca_id ON public.presencas_imagens USING btree (presenca_id);


--
-- Name: idx_presencas_imagens_presenca_tipo; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_presencas_imagens_presenca_tipo ON public.presencas_imagens USING btree (presenca_id, tipo_registro);


--
-- Name: idx_sessoes_data; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_sessoes_data ON public.sessoes USING btree (data);


--
-- Name: idx_sessoes_fim_efetivo_em; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_sessoes_fim_efetivo_em ON public.sessoes USING btree (fim_efetivo_em);


--
-- Name: idx_sessoes_inicio_efetivo_em; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_sessoes_inicio_efetivo_em ON public.sessoes USING btree (inicio_efetivo_em);


--
-- Name: idx_sessoes_tipo_sessao; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_sessoes_tipo_sessao ON public.sessoes USING btree (tipo_sessao);


--
-- Name: idx_sessoes_ativas_data; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_sessoes_ativas_data ON public.sessoes USING btree (data DESC, criado_em DESC) WHERE (fim_efetivo_em IS NULL);


--
-- Name: idx_setores_nome; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_setores_nome ON public.setores USING btree (nome);


--
-- Name: idx_usuarios_ativo; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_usuarios_ativo ON public.usuarios USING btree (ativo);


--
-- Name: idx_usuarios_gestor_id; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_usuarios_gestor_id ON public.usuarios USING btree (gestor_id);


--
-- Name: idx_usuarios_perfil; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_usuarios_perfil ON public.usuarios USING btree (perfil_acesso);


--
-- Name: idx_usuarios_setor_id; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_usuarios_setor_id ON public.usuarios USING btree (setor_id);


--
-- Name: idx_usuarios_usuario_lower; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_usuarios_usuario_lower ON public.usuarios USING btree (lower((usuario)::text));


--
-- Name: idx_usuarios_faces_usuario_id; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_usuarios_faces_usuario_id ON public.usuarios_faces USING btree (usuario_id);


--
-- Name: idx_usuarios_faces_embedding_not_null; Type: INDEX; Schema: public; Owner: vianapeixoto
--

CREATE INDEX idx_usuarios_faces_embedding_not_null ON public.usuarios_faces USING btree (usuario_id) WHERE (embedding IS NOT NULL);


--
-- Name: presencas_imagens presencas_imagens_presenca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.presencas_imagens
    ADD CONSTRAINT presencas_imagens_presenca_id_fkey FOREIGN KEY (presenca_id) REFERENCES public.presencas(id) ON DELETE CASCADE;


--
-- Name: presencas presencas_sessao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.presencas
    ADD CONSTRAINT presencas_sessao_id_fkey FOREIGN KEY (sessao_id) REFERENCES public.sessoes(id) ON DELETE SET NULL;


--
-- Name: presencas presencas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.presencas
    ADD CONSTRAINT presencas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: sessoes sessoes_instrutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.sessoes
    ADD CONSTRAINT sessoes_instrutor_id_fkey FOREIGN KEY (instrutor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: usuarios usuarios_gestor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_gestor_id_fkey FOREIGN KEY (gestor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: usuarios usuarios_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES public.setores(id) ON DELETE SET NULL;


--
-- Name: usuarios_faces usuarios_faces_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
--

ALTER TABLE ONLY public.usuarios_faces
    ADD CONSTRAINT usuarios_faces_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;



--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: vianapeixoto
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--
