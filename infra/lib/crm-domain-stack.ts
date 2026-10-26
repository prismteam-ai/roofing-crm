// T010: Amplify custom-domain association for crm.aldarraj.com, not yet pointed live — cut over
// only after this story merges to feature/roofing-crm (Round 1 decision D-2). The Amplify default
// domain serves RUNTIME_URL in the meantime (CrmWebStack's AmplifyDefaultDomain output).
//
// Matches the proven Task A pattern (CountyLens's CertStack): an AWS::Amplify::Domain only, no
// ACM certificate and no Route 53 hosted zone. Route 53 refuses domain registration on this
// account's Free plan, so the PO's own domain aldarraj.com is registered and served at Namecheap
// instead (AD-13: DNS stays at Namecheap — confirmed here by `aws route53 list-hosted-zones`
// returning no zone for aldarraj.com). Amplify issues and renews the certificate itself
// (Amplify-managed, the default when certificateSettings is omitted) — setting it, even to
// AMPLIFY_MANAGED explicitly, failed Task A's deploy with "A certificate ARN must be provided for
// a custom certificate", so it stays omitted here too.
//
// While `cutover` is false (B-01), this stack declares no resources at all — see module header.
// The cutover's AWS::Amplify::Domain resource is added once D-2 fires, taking CrmWeb's app id and
// branch name so Amplify can issue the certificate and hand back the two DNS records (certificate
// validation + the subdomain's CNAME) for the PO to add manually at Namecheap.
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as amplify from "aws-cdk-lib/aws-amplify";
import type { Construct } from "constructs";

export interface CrmDomainStackProps extends StackProps {
  readonly domainName: string;
  /** False until the Round 1 D-2 cutover decision is executed; true wires the full domain stack. */
  readonly cutover: boolean;
  /** The Amplify app/branch to associate the domain with. Required once `cutover` is true. */
  readonly web?: { readonly appId: string; readonly branchName: string };
}

export class CrmDomainStack extends Stack {
  readonly domain?: amplify.CfnDomain;

  constructor(scope: Construct, id: string, props: CrmDomainStackProps) {
    super(scope, id, props);

    if (!props.cutover) {
      return; // Not yet pointed live (Round 1 decision D-2) — see module header.
    }

    if (props.web === undefined) {
      throw new Error(
        "CrmDomainStack: cutover is true but props.web (appId/branchName) is missing",
      );
    }

    // The domain is the sub-domain itself with an empty prefix, never the root aldarraj.com: a
    // root domain can belong to one Amplify app only, and Task A already owns it for CountyLens.
    this.domain = new amplify.CfnDomain(this, "Domain", {
      appId: props.web.appId,
      domainName: props.domainName,
      subDomainSettings: [{ prefix: "", branchName: props.web.branchName }],
      enableAutoSubDomain: false,
    });

    new CfnOutput(this, "HostedUrl", {
      value: `https://${props.domainName}`,
      description: "The CRM's custom domain URL once DomainStatus is Available.",
    });
    new CfnOutput(this, "DomainStatus", {
      value: this.domain.attrDomainStatus,
      description: "PENDING_VERIFICATION until the Namecheap CNAMEs are added and propagate.",
    });
    new CfnOutput(this, "CertificateVerificationRecord", {
      value: this.domain.attrCertificateRecord,
      description:
        "The certificate-validation CNAME to add at Namecheap (name=value, space-separated).",
    });
  }
}
