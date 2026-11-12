import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as location from "aws-cdk-lib/aws-location";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

export const MAP_KEY_NAME = "roofing-crm-map";
/** End of the account's Free plan (D14); a teardown or the D2 rotation deletes the key earlier. */
export const MAP_KEY_EXPIRES = "2027-05-11T00:00:00Z";
/** Usage alarm: more than this many map tiles in one day (= $0.20 at $0.04 per 1,000 tiles, eu-north-1). */
export const TILES_PER_DAY_ALARM = 5_000;

export interface CrmMapKeyStackProps extends cdk.StackProps {
  origin: string;
  allowActions: string[];
  alertTopicParam?: string;
}

/** Amazon Location API key for the CRM basemap: tiles only, from the Amplify origin only. */
export class CrmMapKeyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CrmMapKeyStackProps) {
    super(scope, id, props);
    const key = new location.CfnAPIKey(this, "MapKey", {
      keyName: MAP_KEY_NAME,
      description:
        "Roofing CRM basemap (Amazon Location Maps v2), Referer-restricted to the Amplify origin",
      restrictions: {
        allowActions: props.allowActions,
        allowResources: [`arn:aws:geo-maps:${this.region}::provider/default`],
        allowReferers: [`${props.origin}/*`],
      },
      expireTime: MAP_KEY_EXPIRES,
      forceUpdate: true,
      forceDelete: true,
    });
    new cdk.CfnOutput(this, "MapKeyName", { value: key.keyName });
    new cdk.CfnOutput(this, "MapKeyArn", { value: key.attrKeyArn });

    if (props.alertTopicParam) {
      const topic = sns.Topic.fromTopicArn(
        this,
        "Alerts",
        ssm.StringParameter.valueForStringParameter(
          this,
          props.alertTopicParam,
        ),
      );
      const tiles = new cloudwatch.Metric({
        namespace: "AWS/Location",
        metricName: "CallCount",
        // Dimension set observed with `aws cloudwatch list-metrics --namespace AWS/Location` (no ApiKeyName-only set exists).
        dimensionsMap: { ApiKeyName: MAP_KEY_NAME, OperationName: "GetTile" },
        statistic: "Sum",
        period: cdk.Duration.days(1),
      });
      new cloudwatch.Alarm(this, "TilesPerDay", {
        alarmName: "roofing-crm-map-tiles-per-day",
        alarmDescription: `More than ${TILES_PER_DAY_ALARM} map tiles in a day (about $0.20 at $0.04 per 1,000)`,
        metric: tiles,
        threshold: TILES_PER_DAY_ALARM,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new actions.SnsAction(topic));
    }
  }
}
