begin;
-- RETURNING must authorize the inserted row without looking it up through a stable function.
alter policy case_scope on cases using(app.is_tenant_member(tenant_id) and (app.has_tenant_role(tenant_id,array['OWNER','ADMIN']) or created_by=app.current_user_id() or responsible_user_id=app.current_user_id() or app.can_read_case(tenant_id,id)));
alter policy client_scope on clients using(app.is_tenant_member(tenant_id) and (app.has_tenant_role(tenant_id,array['OWNER','ADMIN']) or created_by=app.current_user_id() or responsible_user_id=app.current_user_id() or app.can_read_client(tenant_id,id)));
alter policy document_scope on documents using(app.is_tenant_member(tenant_id) and (case when case_id is not null then app.can_read_case(tenant_id,case_id) else app.has_tenant_role(tenant_id,array['OWNER','ADMIN']) or created_by=app.current_user_id() end));
commit;
