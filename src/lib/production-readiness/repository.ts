type CreateDelegate = {
	create(args: { data: Record<string, unknown> }): Promise<unknown>;
};

export type ProductionReadinessClient = {
	productionReadinessPromotion: CreateDelegate;
	productionReadinessReceipt: CreateDelegate;
	productionReadinessPublication: CreateDelegate;
};

type PendingPromotion = {
	candidateDigest: string;
	deploymentId: string;
	commitSha: string;
	owner: string;
	rollbackAuthority: string;
	expiresAt: Date;
};

type PendingReceipt = {
	promotionId: string;
	kind: "PROVENANCE" | "AUTHORIZATION" | "ALERT" | "RESTORE" | "OWNERSHIP";
	payloadDigest: string;
	signer: string;
	scope: string;
	expiresAt: Date;
};

type PendingPublication = { promotionId: string; target: string };

export class ProductionReadinessInputError extends Error {}

export function createProductionReadinessRepository(client: ProductionReadinessClient, now: () => Date = () => new Date()) {
	return {
		async createPendingPromotion(input: PendingPromotion) {
			assertDigest(input.candidateDigest, "candidate digest");
			assertText(input.deploymentId, "deployment ID");
			if (!/^[a-f0-9]{40}$/.test(input.commitSha)) throw new ProductionReadinessInputError("commit SHA must be a lowercase 40-character hash");
			assertText(input.owner, "owner");
			assertText(input.rollbackAuthority, "rollback authority");
			assertExpiry(input.expiresAt, now());
			return client.productionReadinessPromotion.create({ data: { candidate_digest: input.candidateDigest, deployment_id: input.deploymentId, commit_sha: input.commitSha, owner: input.owner, rollback_authority: input.rollbackAuthority, expires_at: input.expiresAt, state: "PENDING" } });
		},
		async recordPendingReceipt(input: PendingReceipt) {
			assertText(input.promotionId, "promotion ID");
			assertDigest(input.payloadDigest, "payload digest");
			assertText(input.signer, "signer");
			assertText(input.scope, "scope");
			assertExpiry(input.expiresAt, now());
			return client.productionReadinessReceipt.create({ data: { promotion_id: input.promotionId, kind: input.kind, payload_digest: input.payloadDigest, signer: input.signer, scope: input.scope, expires_at: input.expiresAt, state: "PENDING" } });
		},
		async recordPendingPublication(input: PendingPublication) {
			assertText(input.promotionId, "promotion ID");
			assertText(input.target, "publication target");
			return client.productionReadinessPublication.create({ data: { promotion_id: input.promotionId, target: input.target, state: "PENDING" } });
		},
	};
}

function assertText(value: string, label: string) {
	if (!value?.trim()) throw new ProductionReadinessInputError(`${label} is required`);
}

function assertDigest(value: string, label: string) {
	if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new ProductionReadinessInputError(`${label} must be a SHA-256 digest`);
}

function assertExpiry(value: Date, current: Date) {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf()) || value <= current) throw new ProductionReadinessInputError("expiry must be a future timestamp");
}
