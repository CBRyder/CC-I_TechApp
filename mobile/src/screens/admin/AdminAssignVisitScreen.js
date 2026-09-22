import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import {
  ScreenContainer,
  SectionHeader,
  Button,
  TextField,
  Dropdown,
  ListRow,
  SegmentedTabs,
  EmptyState,
  spacing,
} from '../../ui';
import { Text, useTheme } from 'react-native-paper';

function todayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 10);
}

// "not completed" — a reassignable visit is one nobody's finished yet.
const REASSIGNABLE_STATUSES = ['at_shop', 'ready', 'in_progress'];

export default function AdminAssignVisitScreen() {
  const { accessToken } = useAuth();
  const theme = useTheme();

  const [mode, setMode] = useState('New Visit');

  const [jobs, setJobs] = useState([]);
  const [techs, setTechs] = useState([]);
  const [openVisits, setOpenVisits] = useState([]);

  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [selectedTechId, setSelectedTechId] = useState(null);
  const [date, setDate] = useState(todayLocalDate());
  // Explicit override for a visit's shop/road labeling — matters most for a
  // tech who's both types, where there's no way to infer it up front (see
  // backend/src/routes/admin.js's actsAsShopSql comment).
  const [visitType, setVisitType] = useState('Road');

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;
  const selectedTech = techs.find((t) => t.id === selectedTechId) || null;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useFocusEffect(
    useCallback(() => {
      api.listJobs(accessToken).then(setJobs).catch(() => {});
      api
        .listAdminUsers(accessToken)
        .then((users) => setTechs(users.filter((u) => u.roles.includes('tech'))))
        .catch(() => {});
      api
        .listAdminVisits({}, accessToken)
        .then((visits) => setOpenVisits(visits.filter((v) => REASSIGNABLE_STATUSES.includes(v.status))))
        .catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken])
  );

  const resetSelections = () => {
    setSelectedJobId(null);
    setSelectedVisit(null);
    setSelectedTechId(null);
    setDate(todayLocalDate());
    setVisitType('Road');
    setError(null);
    setSuccess(null);
  };

  // Auto-set the slider to match a single-type tech (nothing to decide);
  // leave it as whatever's already picked for a tech who's both.
  const selectTech = (techId) => {
    setSelectedTechId(techId);
    const tech = techs.find((t) => t.id === techId);
    if (tech?.tech_types?.length === 1) {
      setVisitType(tech.tech_types[0] === 'shop' ? 'Shop' : 'Road');
    }
  };

  const handleSubmit = async () => {
    if (!selectedTech) {
      setError('Pick a tech.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Date must be in YYYY-MM-DD format.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (mode === 'New Visit') {
        if (!selectedJob) {
          setError('Pick a job.');
          setSubmitting(false);
          return;
        }
        const result = await api.assignVisit(
          { jobId: selectedJob.id, userId: selectedTech.id, date, visitType: visitType.toLowerCase() },
          accessToken
        );
        setSuccess(`Assigned ${result.visitCode} to ${selectedTech.full_name}.`);
      } else {
        if (!selectedVisit) {
          setError('Pick a visit to reassign.');
          setSubmitting(false);
          return;
        }
        await api.reassignVisit(
          selectedVisit.assignment_id,
          { userId: selectedTech.id, date, visitType: visitType.toLowerCase() },
          accessToken
        );
        setSuccess(`Reassigned ${selectedVisit.visit_code} to ${selectedTech.full_name}.`);
      }
      setOpenVisits((current) => current.filter((v) => v.assignment_id !== selectedVisit?.assignment_id));
      setSelectedJobId(null);
      setSelectedVisit(null);
      setSelectedTechId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <SegmentedTabs
        options={['New Visit', 'Reassign Existing']}
        value={mode}
        onChange={(next) => {
          setMode(next);
          resetSelections();
        }}
      />

      {mode === 'New Visit' ? (
        <>
          <SectionHeader>Job</SectionHeader>
          <Dropdown
            label="Job"
            placeholder="Select a job"
            value={selectedJobId}
            options={jobs.map((job) => ({
              key: job.id,
              label: `${job.name} (${job.job_number}${job.customer_name ? ` · ${job.customer_name}` : ''})`,
            }))}
            onSelect={setSelectedJobId}
          />
        </>
      ) : (
        <>
          <SectionHeader>Visit to Reassign</SectionHeader>
          {openVisits.length === 0 ? (
            <EmptyState message="No open visits to reassign." />
          ) : (
            openVisits.map((visit) => (
              <ListRow
                key={visit.assignment_id}
                title={`${visit.visit_code} — ${visit.job_name}`}
                subtitle={`Currently: ${visit.assigned_to}, ${new Date(visit.assigned_date).toLocaleDateString()}`}
                onPress={() => setSelectedVisit(visit)}
                trailing={
                  selectedVisit?.assignment_id === visit.assignment_id ? (
                    <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Selected</Text>
                  ) : null
                }
              />
            ))
          )}
        </>
      )}

      <SectionHeader>Assign To</SectionHeader>
      <Dropdown
        label="Tech"
        placeholder="Select a tech"
        value={selectedTechId}
        options={techs.map((tech) => ({ key: tech.id, label: `${tech.full_name} (${tech.username})` }))}
        onSelect={selectTech}
      />

      <SectionHeader>Visit Type</SectionHeader>
      <SegmentedTabs options={['Road', 'Shop']} value={visitType} onChange={setVisitType} />

      <SectionHeader>Date</SectionHeader>
      <TextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />

      {error ? (
        <Text style={{ color: theme.colors.error, marginBottom: spacing.sm }}>{error}</Text>
      ) : null}
      {success ? (
        <Text style={{ color: theme.colors.primary, marginBottom: spacing.sm }}>{success}</Text>
      ) : null}

      <Button onPress={handleSubmit} loading={submitting} disabled={submitting}>
        {mode === 'New Visit' ? 'Assign Visit' : 'Reassign Visit'}
      </Button>
    </ScreenContainer>
  );
}
