--
-- PostgreSQL database dump
--

\restrict KHx0NeLDPgVH7nLl6yRJRyaTQCxeQHLynQ8jhTirBs6vCzLstPJTLMYEVF7tBJB

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255),
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(255) DEFAULT 'researcher'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT admin_users_role_check CHECK (((role)::text = ANY ((ARRAY['program_admin'::character varying, 'researcher'::character varying])::text[])))
);


--
-- Name: COLUMN admin_users.password_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_users.password_hash IS 'Salted scrypt verifier for the operator login. Never a raw password. Unrelated to guardrail #1, which concerns simulation-target credentials.';


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status character varying(255) DEFAULT 'draft'::character varying NOT NULL,
    phase_label character varying(255),
    enrollment_trigger character varying(255) DEFAULT 'submitted'::character varying NOT NULL,
    scheduled_send_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cloned_from_campaign_id uuid,
    CONSTRAINT campaigns_enrollment_trigger_check CHECK (((enrollment_trigger)::text = ANY ((ARRAY['clicked'::character varying, 'submitted'::character varying])::text[]))),
    CONSTRAINT campaigns_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'paused'::character varying, 'completed'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: COLUMN campaigns.cloned_from_campaign_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaigns.cloned_from_campaign_id IS 'The campaign this one was cloned from (Phase 10 re-test lineage); null for an original phase. Set only at clone time, never editable.';


--
-- Name: cohorts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cohorts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    consent_status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    consent_granted_at timestamp with time zone,
    consent_withdrawn_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT cohorts_consent_status_check CHECK (((consent_status)::text = ANY ((ARRAY['pending'::character varying, 'granted'::character varying, 'withdrawn'::character varying])::text[])))
);


--
-- Name: TABLE cohorts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cohorts IS 'Consent unit. A campaign may only target participants in a cohort with consent_status = granted (guardrail: consent-gated delivery).';


--
-- Name: interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    tracking_token character varying(255) NOT NULL,
    opened boolean DEFAULT false NOT NULL,
    opened_at timestamp with time zone,
    clicked boolean DEFAULT false NOT NULL,
    clicked_at timestamp with time zone,
    submitted boolean DEFAULT false NOT NULL,
    submitted_at timestamp with time zone,
    disclosed boolean DEFAULT false NOT NULL,
    disclosed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: TABLE interactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.interactions IS 'Behavioral flags + timestamps only. Guardrail #1: no column may hold a submitted credential or raw form value. The dummy form handler discards posted values and records only submitted = true.';


--
-- Name: COLUMN interactions.submitted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.interactions.submitted IS 'Boolean only: records that the dummy form was submitted, never the values entered.';


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: learning_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(255) NOT NULL,
    title character varying(255) NOT NULL,
    summary text,
    body_markdown text,
    category character varying(255),
    order_index integer DEFAULT 0 NOT NULL,
    published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cohort_id uuid NOT NULL,
    email_or_phone_hash character varying(255) NOT NULL,
    role character varying(255),
    department character varying(255),
    opted_out boolean DEFAULT false NOT NULL,
    opted_out_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: COLUMN participants.email_or_phone_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participants.email_or_phone_hash IS 'Keyed hash of contact identifier. Raw email/phone is never stored (guardrail: data minimization).';


--
-- Name: quizzes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quizzes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    learning_module_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    pass_threshold integer DEFAULT 70 NOT NULL,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT quizzes_pass_threshold_check CHECK (((pass_threshold >= 0) AND (pass_threshold <= 100)))
);


--
-- Name: training_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid NOT NULL,
    learning_module_id uuid NOT NULL,
    campaign_id uuid,
    assigned_reason character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'assigned'::character varying NOT NULL,
    assigned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completion_token character varying(255),
    notified_at timestamp with time zone,
    CONSTRAINT training_assignments_status_check CHECK (((status)::text = ANY ((ARRAY['assigned'::character varying, 'in_progress'::character varying, 'completed'::character varying])::text[])))
);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: admin_users admin_users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_unique UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: cohorts cohorts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cohorts
    ADD CONSTRAINT cohorts_pkey PRIMARY KEY (id);


--
-- Name: interactions interactions_campaign_id_participant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_campaign_id_participant_id_unique UNIQUE (campaign_id, participant_id);


--
-- Name: interactions interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_pkey PRIMARY KEY (id);


--
-- Name: interactions interactions_tracking_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_tracking_token_unique UNIQUE (tracking_token);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: learning_modules learning_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_modules
    ADD CONSTRAINT learning_modules_pkey PRIMARY KEY (id);


--
-- Name: learning_modules learning_modules_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_modules
    ADD CONSTRAINT learning_modules_slug_unique UNIQUE (slug);


--
-- Name: participants participants_email_or_phone_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_email_or_phone_hash_unique UNIQUE (email_or_phone_hash);


--
-- Name: participants participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_pkey PRIMARY KEY (id);


--
-- Name: quizzes quizzes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_pkey PRIMARY KEY (id);


--
-- Name: training_assignments training_assignments_completion_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_assignments
    ADD CONSTRAINT training_assignments_completion_token_unique UNIQUE (completion_token);


--
-- Name: training_assignments training_assignments_participant_id_learning_module_id_campaign; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_assignments
    ADD CONSTRAINT training_assignments_participant_id_learning_module_id_campaign UNIQUE (participant_id, learning_module_id, campaign_id);


--
-- Name: training_assignments training_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_assignments
    ADD CONSTRAINT training_assignments_pkey PRIMARY KEY (id);


--
-- Name: campaigns_cloned_from_campaign_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_cloned_from_campaign_id_index ON public.campaigns USING btree (cloned_from_campaign_id);


--
-- Name: campaigns_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_status_index ON public.campaigns USING btree (status);


--
-- Name: interactions_campaign_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interactions_campaign_id_index ON public.interactions USING btree (campaign_id);


--
-- Name: learning_modules_category_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_modules_category_index ON public.learning_modules USING btree (category);


--
-- Name: learning_modules_published_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_modules_published_index ON public.learning_modules USING btree (published);


--
-- Name: participants_cohort_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX participants_cohort_id_index ON public.participants USING btree (cohort_id);


--
-- Name: participants_department_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX participants_department_index ON public.participants USING btree (department);


--
-- Name: quizzes_learning_module_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quizzes_learning_module_id_index ON public.quizzes USING btree (learning_module_id);


--
-- Name: training_assignments_participant_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_assignments_participant_id_index ON public.training_assignments USING btree (participant_id);


--
-- Name: training_assignments_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_assignments_status_index ON public.training_assignments USING btree (status);


--
-- Name: campaigns campaigns_cloned_from_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_cloned_from_campaign_id_foreign FOREIGN KEY (cloned_from_campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: interactions interactions_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: interactions interactions_participant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_participant_id_foreign FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;


--
-- Name: participants participants_cohort_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_cohort_id_foreign FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE RESTRICT;


--
-- Name: quizzes quizzes_learning_module_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_learning_module_id_foreign FOREIGN KEY (learning_module_id) REFERENCES public.learning_modules(id) ON DELETE CASCADE;


--
-- Name: training_assignments training_assignments_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_assignments
    ADD CONSTRAINT training_assignments_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: training_assignments training_assignments_learning_module_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_assignments
    ADD CONSTRAINT training_assignments_learning_module_id_foreign FOREIGN KEY (learning_module_id) REFERENCES public.learning_modules(id) ON DELETE RESTRICT;


--
-- Name: training_assignments training_assignments_participant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_assignments
    ADD CONSTRAINT training_assignments_participant_id_foreign FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict KHx0NeLDPgVH7nLl6yRJRyaTQCxeQHLynQ8jhTirBs6vCzLstPJTLMYEVF7tBJB

