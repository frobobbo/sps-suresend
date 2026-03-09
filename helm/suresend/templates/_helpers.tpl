{{/*
Expand the name of the chart.
*/}}
{{- define "suresend.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "suresend.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label.
*/}}
{{- define "suresend.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "suresend.labels" -}}
helm.sh/chart: {{ include "suresend.chart" . }}
{{ include "suresend.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "suresend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "suresend.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
API image tag — falls back to .Chart.AppVersion.
*/}}
{{- define "suresend.api.image" -}}
{{- $tag := .Values.api.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.api.image.repository $tag }}
{{- end }}

{{/*
Web image tag — falls back to .Chart.AppVersion.
*/}}
{{- define "suresend.web.image" -}}
{{- $tag := .Values.web.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.web.image.repository $tag }}
{{- end }}

{{/*
Worker image tag — falls back to API image settings and .Chart.AppVersion.
*/}}
{{- define "suresend.worker.image" -}}
{{- $repository := .Values.worker.image.repository | default .Values.api.image.repository }}
{{- $tag := .Values.worker.image.tag | default .Values.api.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" $repository $tag }}
{{- end }}
