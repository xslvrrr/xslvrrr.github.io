CREATE TABLE IF NOT EXISTS public.assistant_action_approvals (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  thread_id text,
  action_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_action_approvals_user_pending_idx
  ON public.assistant_action_approvals (user_id, expires_at);
CREATE INDEX IF NOT EXISTS assistant_action_approvals_expires_at_idx
  ON public.assistant_action_approvals (expires_at);

ALTER TABLE public.assistant_action_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assistant_action_approvals FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_assistant_action_approval(
  p_approval_id uuid,
  p_user_id uuid,
  p_action_digest text
)
RETURNS TABLE(consumed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  DELETE FROM public.assistant_action_approvals AS approval
  WHERE approval.id = p_approval_id
    AND approval.user_id = p_user_id
    AND approval.action_digest = p_action_digest
    AND approval.expires_at > now()
  RETURNING true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_assistant_action_approval(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_assistant_action_approval(uuid, uuid, text) TO service_role;
