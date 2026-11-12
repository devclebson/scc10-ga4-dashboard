"""Executa consultas exploratórias GA4 e imprime apenas o contrato das respostas."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from flask_app.services.ga4_service import run_historical_report


DATE_RANGE = {
    "startDate": os.environ.get("GA4_PROBE_START", "30daysAgo"),
    "endDate": os.environ.get("GA4_PROBE_END", "yesterday"),
}
PROPERTY_ID = os.environ.get("SCC10_PROPERTY_ID")

PROBES = {
    "overview_daily": {
        "dimensions": ["date"],
        "metrics": ["sessions", "activeUsers", "screenPageViews", "bounceRate", "averageSessionDuration", "engagedSessions", "newUsers"],
        "limit": 500,
    },
    "channels": {
        "dimensions": ["sessionDefaultChannelGroup"],
        "metrics": ["sessions", "activeUsers", "screenPageViews", "newUsers", "engagedSessions", "engagementRate"],
        "limit": 25,
    },
    "session_source_medium": {
        "dimensions": ["sessionSourceMedium"],
        "metrics": ["sessions", "activeUsers", "screenPageViews", "newUsers"],
        "limit": 25,
    },
    "source_medium_sessions": {
        "dimensions": ["sourceMedium"],
        "metrics": ["sessions"],
        "limit": 25,
    },
    "source_medium_sessions_users": {
        "dimensions": ["sourceMedium"],
        "metrics": ["sessions", "activeUsers"],
        "limit": 25,
    },
    "first_user_source_medium": {
        "dimensions": ["firstUserSourceMedium"],
        "metrics": ["newUsers", "activeUsers", "sessions"],
        "limit": 25,
    },
    "campaigns": {
        "dimensions": ["sessionCampaignName"],
        "metrics": ["sessions", "activeUsers", "screenPageViews"],
        "limit": 25,
    },
    "geo": {
        "dimensions": ["country", "region"],
        "metrics": ["sessions", "activeUsers", "screenPageViews"],
        "limit": 25,
    },
    "devices": {
        "dimensions": ["deviceCategory", "operatingSystem", "browser"],
        "metrics": ["sessions", "activeUsers", "screenPageViews"],
        "limit": 25,
    },
    "pages": {
        "dimensions": ["pagePath", "pageTitle"],
        "metrics": ["screenPageViews", "activeUsers", "sessions", "averageSessionDuration", "bounceRate", "engagedSessions"],
        "limit": 25,
    },
    "events": {
        "dimensions": ["eventName"],
        "metrics": ["eventCount", "totalUsers", "keyEvents"],
        "limit": 25,
    },
    "content_metadata": {
        "dimensions": ["pageTitle", "pagePath", "customEvent:categories", "customEvent:author", "customEvent:published_date", "customEvent:published_hour"],
        "metrics": ["screenPageViews", "activeUsers"],
        "limit": 25,
    },
}


def payload_for(spec):
    return {
        "dateRanges": [DATE_RANGE],
        "dimensions": [{"name": name} for name in spec["dimensions"]],
        "metrics": [{"name": name} for name in spec["metrics"]],
        "limit": spec["limit"],
    }


def summarize(name, spec, report):
    rows = report.get("rows", [])
    non_empty = {}
    for index, dimension in enumerate(spec["dimensions"]):
        non_empty[dimension] = sum(
            1 for row in rows
            if len(row.get("dimensionValues", [])) > index
            and row["dimensionValues"][index].get("value", "") not in {"", "(not set)"}
        )
    return {
        "name": name,
        "status": "ok",
        "dimensionsRequested": spec["dimensions"],
        "metricsRequested": spec["metrics"],
        "dimensionHeaders": [item.get("name") for item in report.get("dimensionHeaders", [])],
        "metricHeaders": [item.get("name") for item in report.get("metricHeaders", [])],
        "rowCount": report.get("rowCount", len(report.get("rows", []))),
        "rowsReturned": len(rows),
        "nonEmptyRowsInReturnedPage": non_empty,
        "metadata": report.get("metadata", {}),
        "propertyQuotaPresent": "propertyQuota" in report,
    }


def main():
    if not PROPERTY_ID or not str(PROPERTY_ID).isdigit():
        raise SystemExit("SCC10_PROPERTY_ID não configurada ou inválida.")
    results = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "propertyId": str(PROPERTY_ID),
        "dateRange": DATE_RANGE,
        "queries": [],
    }
    for name, spec in PROBES.items():
        try:
            report = run_historical_report(str(PROPERTY_ID), payload_for(spec), force_refresh=True)
            results["queries"].append(summarize(name, spec, report))
        except Exception as error:
            results["queries"].append({
                "name": name,
                "status": "error",
                "dimensionsRequested": spec["dimensions"],
                "metricsRequested": spec["metrics"],
                "errorType": type(error).__name__,
                "error": str(error),
            })
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
